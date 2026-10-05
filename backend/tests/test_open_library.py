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


@pytest.mark.asyncio
async def test_search_returns_normalized_documents():
    with patch(
        "hon.services.open_library.httpx.AsyncClient",
        return_value=async_client({"docs": [document()]}, {"docs": []}),
    ):
        books = await search("dune")
    assert [book.id for book in books] == ["OL1W"]


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
