import asyncio
import json
from unittest.mock import patch

import httpx
import pytest

from hon.services.open_library import normalize, search
from tests.conftest import async_client, response


def document(pages: object = 100, cover_id: int | None = 123) -> dict:
    value = {
        "key": "/works/OL1W",
        "title": "Dune",
        "number_of_pages_median": pages,
    }
    if cover_id is not None:
        value["cover_i"] = cover_id
    return value


def test_normalize_filters_malformed_documents():
    assert normalize({"title": "Missing Key", "number_of_pages_median": 10}) is None
    book = normalize(document(pages="many"))
    assert book is not None and book.page_count is None
    value = document()
    value["title"] = "   "
    assert normalize(value) is None


def test_normalize_handles_missing_cover():
    book = normalize(document(cover_id=None))
    assert book is not None
    assert book.cover_url is None


def test_normalize_uses_work_ratings_without_losing_edition_metadata():
    value = {
        **document(),
        "ratings_count": 13572,
        "author_name": ["R. F. Kuang"],
        "editions": {
            "docs": [
                {
                    "key": "/books/OL2M",
                    "title": "Babel",
                    "language": ["por"],
                    "ratings_count": 1,
                }
            ]
        },
    }
    book = normalize(value)
    assert book is not None
    assert (book.id, book.language, book.author, book.popularity) == ("OL2M", "pt", "R. F. Kuang", 13572)


@pytest.mark.parametrize(
    ("ratings_count", "expected"),
    [(0, 0), (True, None), (False, None), ("500", None), (-1, None), (1.5, None), (None, None)],
)
def test_normalize_accepts_only_nonnegative_integer_work_ratings(ratings_count, expected):
    book = normalize({**document(), "ratings_count": ratings_count})
    assert book is not None
    assert book.popularity == expected


@pytest.mark.asyncio
async def test_search_returns_normalized_documents():
    client = async_client({"docs": [{**document(), "ratings_count": 4291}]}, {"docs": []})
    with patch("hon.services.open_library.httpx.AsyncClient", return_value=client):
        books = await search("dune")
    assert [book.id for book in books] == ["OL1W"]
    assert books[0].popularity == 4291
    assert "ratings_count" in client.get.call_args_list[0].kwargs["params"]["fields"].split(",")


@pytest.mark.asyncio
async def test_search_rejects_malformed_response_root():
    with (
        patch("hon.services.open_library.httpx.AsyncClient", return_value=async_client([], [])),
        pytest.raises(httpx.DecodingError),
    ):
        await search("dune")


@pytest.mark.asyncio
async def test_search_translates_malformed_json():
    client = async_client()
    client.get.return_value = response(json_error=json.JSONDecodeError("bad", "", 0))
    client.get.side_effect = None
    with (
        patch("hon.services.open_library.httpx.AsyncClient", return_value=client),
        pytest.raises(httpx.DecodingError),
    ):
        await search("dune")


@pytest.mark.asyncio
async def test_global_and_regional_editions_are_combined():
    english = {**document(), "key": "/works/en", "language": ["eng"]}
    translated = {**document(), "key": "/works/pt", "language": ["por"]}
    client = async_client({"docs": [english]}, {"docs": [translated]})
    with patch("hon.services.open_library.httpx.AsyncClient", return_value=client):
        books = await search("dune")
    assert {book.language for book in books} == {"en", "pt"}
    assert client.get.call_args_list[0].kwargs["params"]["q"] == "dune"


@pytest.mark.asyncio
@pytest.mark.parametrize("failed_pass", [0, 1])
async def test_one_edition_pass_survives_the_other_timing_out(failed_pass):
    client = async_client()
    client.get.side_effect = [
        httpx.ReadTimeout("timeout") if index == failed_pass else response({"docs": [document()]}) for index in range(2)
    ]
    with patch("hon.services.open_library.httpx.AsyncClient", return_value=client):
        assert len(await search("dune")) == 1


@pytest.mark.asyncio
async def test_isbn_lookup_does_not_expand_to_other_editions():
    client = async_client({"docs": [{**document(), "isbn": ["9788551012239"]}]})
    with patch("hon.services.open_library.httpx.AsyncClient", return_value=client):
        assert len(await search("9788551012239")) == 1
    assert client.get.call_count == 1


@pytest.mark.asyncio
async def test_edition_hydration_starts_all_top_matches_concurrently():
    docs = [
        {
            "key": f"/works/OL{index}W",
            "title": "Dune",
            "author_name": ["Frank Herbert"],
            "editions": {"docs": [{"key": f"/books/OL{index}M", "title": "Dune"}]},
        }
        for index in range(1, 5)
    ]
    started: set[str] = set()
    all_started = asyncio.Event()
    release = asyncio.Event()

    async def get(url, *, params=None, timeout=None):
        if url.endswith("/search.json"):
            assert params is not None
            return response({"docs": docs} if params["q"] == "dune" else {"docs": []})
        started.add(url)
        if len(started) == 4:
            all_started.set()
        await release.wait()
        return response({"number_of_pages": int(url.split("/OL")[1].split("M")[0]) * 100})

    client = async_client()
    client.get.side_effect = get
    with patch("hon.services.open_library.httpx.AsyncClient", return_value=client):
        task = asyncio.create_task(search("dune"))
        try:
            await asyncio.wait_for(all_started.wait(), timeout=1)
        finally:
            release.set()
        books = await task
    assert {book.id: book.page_count for book in books} == {
        f"OL{index}M": index * 100 for index in range(1, 5)
    }


@pytest.mark.asyncio
async def test_missing_author_lookup_does_not_wait_for_edition_pages():
    isbn = "9788551012239"
    edition_started = asyncio.Event()
    author_started = asyncio.Event()
    release_edition = asyncio.Event()
    doc = {
        "key": "/works/OL1W",
        "title": "Dune",
        "editions": {"docs": [{"key": "/books/OL1M", "title": "Dune", "isbn": [isbn]}]},
    }

    async def get(url, *, params=None, timeout=None):
        if url.endswith("/search.json"):
            return response({"docs": [doc]})
        if url.endswith("/books/OL1M.json"):
            edition_started.set()
            await release_edition.wait()
            return response({"number_of_pages": 250})
        author_started.set()
        return response({"isbn": isbn, "authors": ["Frank Herbert"], "page_count": 999})

    client = async_client()
    client.get.side_effect = get
    with patch("hon.services.open_library.httpx.AsyncClient", return_value=client):
        task = asyncio.create_task(search(isbn))
        try:
            await asyncio.wait_for(edition_started.wait(), timeout=1)
            await asyncio.wait_for(author_started.wait(), timeout=1)
        finally:
            release_edition.set()
        books = await task
    assert books[0].author == "Frank Herbert"
    assert books[0].page_count == 250
