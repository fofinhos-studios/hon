import json
from unittest.mock import patch

import httpx
import pytest

from hon.models.book import BookResult, SearchResult
from hon.services.hardcover import SeriesProviderError, search_series


def row(
    book_id: int | None,
    position: float | None,
    *,
    title: str | None = None,
    pages: object = 100,
    **book_fields: object,
) -> dict:
    return {
        "position": position,
        "book": {
            "id": book_id,
            "title": title if title is not None else f"Volume {book_id}",
            "pages": pages,
            "contributions": [],
            "default_physical_edition": None,
            "default_ebook_edition": None,
            **book_fields,
        },
    }


def transport(
    series_members: dict[str, list[dict]], *, counts: dict[str, int | None] | None = None,
    results: list[str] | None = None, fail_offset: int | None = None,
    search_error: bool = False, detail_error: bool = False,
) -> tuple[httpx.MockTransport, list[dict]]:
    calls: list[dict] = []
    slugs = results if results is not None else list(series_members)

    def handle(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert str(request.url) == "https://api.hardcover.app/v1/graphql"
        assert request.headers["authorization"] == "Bearer private-test-token"
        payload = json.loads(request.content)
        calls.append(payload)
        if "SearchSeries" in payload["query"]:
            assert payload["variables"] == {"query": "The Wheel of Time"}
            assert 'query_type: "Series", per_page: 5, page: 1' in payload["query"]
            if search_error:
                return httpx.Response(200, json={"errors": [{"message": "search unavailable"}]})
            return httpx.Response(200, json={"data": {"search": {"results": {
                "hits": [{"document": {"slug": slug}} for slug in slugs],
            }}}})
        assert "SeriesBooks" in payload["query"]
        query = payload["query"]
        assert "canonical_id: {_is_null: true}" in query
        assert "is_partial_book: {_eq: false}" in query
        assert "compilation: {_eq: false}" in query
        assert "{position: asc}, {book: {users_count: desc}}, {book_id: asc}" in query
        assert "default_physical_edition" in query and "default_ebook_edition" in query
        slug = payload["variables"]["slug"]
        offset = payload["variables"]["offset"]
        if offset == fail_offset or detail_error:
            return httpx.Response(200, json={"errors": [{"message": "detail unavailable"}]})
        members = series_members[slug][offset : offset + 100]
        return httpx.Response(200, json={"data": {"series": [{
            "id": 42, "name": "The Wheel of Time", "author": {"name": "Robert Jordan"},
            "primary_books_count": (counts or {}).get(slug), "book_series": members,
        }]}})

    return httpx.MockTransport(handle), calls


async def lookup(monkeypatch: pytest.MonkeyPatch, mock: httpx.MockTransport):
    monkeypatch.setenv("HARDCOVER_API_TOKEN", "private-test-token")
    client_type = httpx.AsyncClient
    with patch(
        "hon.services.hardcover.httpx.AsyncClient",
        side_effect=lambda **options: client_type(transport=mock, **options),
    ):
        return await search_series("The Wheel of Time")


@pytest.mark.asyncio
async def test_main_optional_order_duplicates_and_provenance(monkeypatch: pytest.MonkeyPatch):
    isbn = "9780441172719"
    physical = {"id": 10, "pages": 220, "isbn_13": isbn, "language": {"code2": "en"}}
    ebook = {"id": 11, "pages": 190, "isbn_13": "bad", "language": {"code2": "fr"}}
    members = [
        row(2, 2, title="Second", pages=80, default_physical_edition={**physical, "pages": 0},
            default_ebook_edition=ebook),
        row(1, 1, title="First", pages=90, default_physical_edition=physical,
            contributions=[{"contribution": "Author", "author": {"name": "Original Writer"}}]),
        row(3, 1, title="Duplicate first", pages=40),
        row(4, 0, title="Prelude", pages=60),
        row(5, 0, title="Another prelude", pages=50),
        row(6, 1.5, title="Interlude", pages=70),
        row(6, 1.5, title="Repeat interlude", pages=70),
        row(7, None, title="Zeta", pages=0),
        row(8, None, title="Alpha", pages=100, default_physical_edition={**physical, "pages": 0}),
    ]
    mock, calls = transport({"wheel": members}, counts={"wheel": 2})
    [series] = await lookup(monkeypatch, mock)
    assert series.id == "42"
    assert series.incomplete is False
    assert [(book.id, book.series.position) for book in series.members] == [
        ("hardcover:4", 0), ("hardcover:5", 0), ("hardcover:1", 1),
        ("hardcover:6", 1.5), ("hardcover:2", 2), ("hardcover:8", None), ("hardcover:7", None),
    ]
    first = series.members[2]
    assert (first.author, first.page_count, first.format, first.isbn, first.language) == (
        "Original Writer", 220, "physical", isbn, "en",
    )
    assert first.cover_url is None
    assert first.cover_fallback_url == f"https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg?default=false"
    second = series.members[4]
    assert (second.author, second.page_count, second.format, second.isbn, second.language) == (
        "Robert Jordan", 190, "digital", None, "fr",
    )
    assert second.cover_fallback_url is None
    summary = series.members[-2]
    assert (summary.page_count, summary.format, summary.isbn, summary.language) == (
        100, "unspecified", None, None,
    )
    unnumbered = series.members[-1]
    assert (unnumbered.page_count, unnumbered.format, unnumbered.isbn, unnumbered.language) == (
        None, "unspecified", None, None,
    )
    assert all(book.series.name == "The Wheel of Time" for book in series.members)
    assert [call["variables"].get("offset") for call in calls] == [None, 0]
    serialized = SearchResult(books=[], series=[series], source="hardcover").model_dump()
    assert serialized["series"][0]["members"][2]["series"] == {
        "id": "42", "name": "The Wheel of Time", "position": 1.0,
    }
    assert BookResult(id="old", title="Old", author="Writer", page_count=1, cover_url=None).series is None


@pytest.mark.asyncio
@pytest.mark.parametrize("positions,count", [([1, 3], 2), ([2, 3], None), ([1], 2)])
async def test_detects_main_membership_gaps(monkeypatch: pytest.MonkeyPatch, positions, count):
    mock, _ = transport({"wheel": [row(index, position) for index, position in enumerate(positions, 1)]},
                        counts={"wheel": count})
    [series] = await lookup(monkeypatch, mock)
    assert series.incomplete is True


@pytest.mark.asyncio
async def test_missing_id_or_title_is_omitted_and_marks_incomplete(monkeypatch: pytest.MonkeyPatch):
    missing_title = row(2, 2)
    missing_title["book"]["title"] = "  "
    mock, _ = transport({"wheel": [row(1, 1), missing_title, row(None, 3), {"position": 4, "book": None}]},
                        counts={"wheel": 1})
    [series] = await lookup(monkeypatch, mock)
    assert [book.id for book in series.members] == ["hardcover:1"]
    assert series.incomplete is True


@pytest.mark.asyncio
async def test_pages_all_members_including_empty_last_page(monkeypatch: pytest.MonkeyPatch):
    members = [row(index, index) for index in range(1, 201)]
    mock, calls = transport({"wheel": members}, counts={"wheel": 200})
    [series] = await lookup(monkeypatch, mock)
    assert len(series.members) == 200
    assert series.members[-1].id == "hardcover:200"
    assert series.incomplete is False
    assert [call["variables"].get("offset") for call in calls] == [None, 0, 100, 200]


@pytest.mark.asyncio
async def test_skips_empty_series_and_returns_first_three_valid_hits(monkeypatch: pytest.MonkeyPatch):
    mock, calls = transport({"empty": [], "one": [row(1, 1)], "two": [row(2, 1)],
                             "three": [row(3, 1)], "four": [row(4, 1)]})
    series = await lookup(monkeypatch, mock)
    assert [book.members[0].id for book in series] == ["hardcover:1", "hardcover:2", "hardcover:3"]
    assert [call["variables"].get("slug") for call in calls] == [None, "empty", "one", "two", "three"]


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["search", "detail", "member", "envelope", "list"])
async def test_graphql_errors_or_bad_detail_discard_all_series(monkeypatch: pytest.MonkeyPatch, kind: str):
    members = {"first": [row(1, 1)], "second": [row(2, 1)]}
    mock, _ = transport(members, search_error=kind == "search", detail_error=kind == "detail")
    if kind in {"member", "envelope", "list"}:
        def handle(request: httpx.Request) -> httpx.Response:
            body = json.loads(request.content)
            if "SearchSeries" in body["query"]:
                return httpx.Response(200, json={"data": {"search": {"results": {
                    "hits": [{"document": {"slug": "first"}}, {"document": {"slug": "second"}}],
                }}}})
            if body["variables"]["slug"] == "first":
                return httpx.Response(200, json={"data": {"series": [{"id": 42, "name": "The Wheel of Time",
                    "author": None, "primary_books_count": 1, "book_series": [row(1, 1)]}]}})
            if kind == "member":
                invalid = [{"position": 1, "book": []}]
                return httpx.Response(200, json={"data": {"series": [{"id": 42, "name": "The Wheel of Time",
                    "author": None, "primary_books_count": 1, "book_series": invalid}]}})
            if kind == "list":
                return httpx.Response(200, json={"data": {"series": [{"id": 42, "name": "The Wheel of Time",
                    "author": None, "primary_books_count": 1, "book_series": None}]}})
            return httpx.Response(200, json={"data": None})
        mock = httpx.MockTransport(handle)
    with pytest.raises(SeriesProviderError):
        await lookup(monkeypatch, mock)


@pytest.mark.asyncio
async def test_detail_failure_after_first_page_discards_series(monkeypatch: pytest.MonkeyPatch):
    mock, calls = transport({"wheel": [row(index, index) for index in range(1, 102)]}, fail_offset=100)
    with pytest.raises(SeriesProviderError):
        await lookup(monkeypatch, mock)
    assert [call["variables"].get("offset") for call in calls] == [None, 0, 100]


@pytest.mark.asyncio
async def test_missing_token_raises_without_network_access(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("HARDCOVER_API_TOKEN", raising=False)
    with patch("hon.services.hardcover.httpx.AsyncClient") as client:
        with pytest.raises(SeriesProviderError, match="not configured"):
            await search_series("The Wheel of Time")
        client.assert_not_called()
