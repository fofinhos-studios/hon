import json
from unittest.mock import patch

import httpx
import pytest

from hon.models.book import BookResult, SearchResult
from hon.services.hardcover import SeriesProviderError, enrich_catalog_books, search_series


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
        100, "unspecified", None, "en",
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
async def test_series_excludes_translated_optional_books(monkeypatch: pytest.MonkeyPatch):
    english = {"id": 10, "pages": 200, "isbn_13": None, "language": {"code2": "en"}}
    dutch = {"id": 11, "pages": 368, "isbn_13": None, "language": {"code2": "nl"}}
    members = [
        row(10, 0, title="De Wereld van Het Rad des Tijds", pages=368,
            default_physical_edition={**dutch, "pages": 0}),
        row(11, 0, title="New Spring", default_physical_edition=english),
        row(12, 1.5, title="Een andere vertaling", default_physical_edition=dutch),
        row(13, 1, title="The Eye of the World", default_physical_edition=english),
        row(14, 2, title="The Great Hunt", default_physical_edition=english),
        row(15, None, title="Companion without language"),
    ]
    mock, _ = transport({"wheel": members}, counts={"wheel": 2})
    [series] = await lookup(monkeypatch, mock)
    assert [(book.title, book.language) for book in series.members] == [
        ("New Spring", "en"),
        ("The Eye of the World", "en"),
        ("The Great Hunt", "en"),
        ("Companion without language", None),
    ]
    assert series.incomplete is False


@pytest.mark.asyncio
async def test_series_keeps_optional_books_when_main_languages_conflict(monkeypatch: pytest.MonkeyPatch):
    def edition(code: str) -> dict:
        return {"id": 10, "pages": 200, "isbn_13": None, "language": {"code2": code}}

    mock, _ = transport({"wheel": [
        row(1, 1, title="English volume", default_physical_edition=edition("en")),
        row(2, 2, title="French volume", default_physical_edition=edition("fr")),
        row(3, 0, title="Dutch companion", default_physical_edition=edition("nl")),
    ]}, counts={"wheel": 2})
    [series] = await lookup(monkeypatch, mock)
    assert [book.title for book in series.members] == [
        "Dutch companion", "English volume", "French volume",
    ]
    assert series.incomplete is False


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


def catalog_membership_book(
    book_id: int, *, title: str = "Dune", author: str | None = "Frank Herbert",
    position: float | None = 1, featured: bool = True, **changes,
) -> dict:
    membership = {
        "position": position, "compilation": False,
        "series": {"id": 81, "name": "Dune Saga", "canonical_id": None},
    }
    book = {
        "id": book_id, "title": title, "canonical_id": None, "is_partial_book": False,
        "compilation": False,
        "contributions": ([{"contribution": "Author", "author": {"name": author}}] if author else []),
        "featured_book_series": membership if featured else None,
        "book_series": [membership],
    }
    return {**book, **changes}


def membership_transport(
    editions: list[dict], *, hits: list[int] | None = None, books: list[dict] | None = None,
    fail: str | None = None,
) -> tuple[httpx.MockTransport, list[dict]]:
    calls: list[dict] = []

    def handle(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer private-test-token"
        payload = json.loads(request.content)
        calls.append(payload)
        if fail and fail in payload["query"]:
            return httpx.Response(200, json={"errors": [{"message": "unavailable"}]})
        if "EditionMemberships" in payload["query"]:
            assert "isbn_13: {_in: $isbns}" in payload["query"]
            assert "is_partial_book compilation" in payload["query"]
            return httpx.Response(200, json={"data": {"editions": editions}})
        if "SearchBooks" in payload["query"]:
            assert "{ ids }" in payload["query"]
            return httpx.Response(200, json={"data": {"search": {"ids": hits or []}}})
        assert "BookMemberships" in payload["query"]
        assert "is_partial_book compilation" in payload["query"]
        return httpx.Response(200, json={"data": {"books": books or []}})

    return httpx.MockTransport(handle), calls


async def enrich(monkeypatch: pytest.MonkeyPatch, mock: httpx.MockTransport, books: list[BookResult]):
    monkeypatch.setenv("HARDCOVER_API_TOKEN", "private-test-token")
    client_type = httpx.AsyncClient
    with patch("hon.services.hardcover.httpx.AsyncClient",
               side_effect=lambda **options: client_type(transport=mock, **options)):
        return await enrich_catalog_books("Dune", books)


@pytest.mark.asyncio
async def test_exact_isbn_is_batched_and_preserves_catalog_edition(monkeypatch: pytest.MonkeyPatch):
    isbn = "9780441172719"
    other = "9780140328721"
    first = BookResult(
        source="google_books", id="google-1", title="Dune", author="Frank Herbert",
        format="digital", page_count=500, cover_url="https://example.test/catalog.jpg", isbn=isbn,
    )
    second = first.model_copy(update={"id": "ol-2", "isbn": other, "page_count": 312})
    mock, calls = membership_transport([
        {"isbn_13": isbn, "book": catalog_membership_book(1, position=0)},
        {"isbn_13": other, "book": catalog_membership_book(2, position=1.5, featured=False)},
    ])
    matched = await enrich(monkeypatch, mock, [first, second])
    assert [(book.series.id, book.series.name, book.series.position) for book in matched] == [
        ("81", "Dune Saga", 0), ("81", "Dune Saga", 1.5),
    ]
    assert matched[0].model_dump(exclude={"series"}) == first.model_dump(exclude={"series"})
    assert matched[1].model_dump(exclude={"series"}) == second.model_dump(exclude={"series"})
    assert len(calls) == 1
    assert calls[0]["variables"] == {"isbns": [isbn, other]}

@pytest.mark.asyncio
async def test_isbn_match_rejects_a_different_catalog_work_or_author(monkeypatch: pytest.MonkeyPatch):
    isbn = "9780441172719"
    catalog = BookResult(
        id="dune", title="Dune", author="Frank Herbert", page_count=412,
        cover_url=None, isbn=isbn,
    )
    wrong_title = catalog.model_copy(update={"id": "messiah", "title": "Dune Messiah"})
    wrong_author = catalog.model_copy(update={"id": "another-writer", "author": "Brian Herbert"})
    mock, _ = membership_transport([
        {"isbn_13": isbn, "book": catalog_membership_book(1)},
    ])
    correct, other_work, other_writer = await enrich(
        monkeypatch, mock, [catalog, wrong_title, wrong_author],
    )
    assert correct.series is not None
    assert other_work.series is None
    assert other_writer.series is None


@pytest.mark.asyncio
async def test_isbn10_is_normalized_before_exact_edition_lookup(monkeypatch: pytest.MonkeyPatch):
    catalog = BookResult(id="catalog", title="Dune", author="Frank Herbert", page_count=412,
                         cover_url=None, isbn="0441172717")
    mock, calls = membership_transport([
        {"isbn_13": "9780441172719", "book": catalog_membership_book(1)},
    ])
    [matched] = await enrich(monkeypatch, mock, [catalog])
    assert matched.isbn == "0441172717"
    assert matched.series.name == "Dune Saga"
    assert calls[0]["variables"] == {"isbns": ["9780441172719"]}

@pytest.mark.asyncio
async def test_isbn_false_positives_are_not_assigned(monkeypatch: pytest.MonkeyPatch):
    isbn = "9780441172719"
    other = "9780140328721"
    catalog = BookResult(id="catalog", title="Dune", author="Frank Herbert", page_count=412, cover_url=None)
    invalid_featured = catalog_membership_book(3)
    invalid_featured["featured_book_series"] = {
        **invalid_featured["featured_book_series"], "compilation": True,
    }
    candidates = [
        (isbn, [catalog_membership_book(1), catalog_membership_book(2)]),
        (other, [catalog_membership_book(4, canonical_id=99)]),
    ]
    editions = [{"isbn_13": code, "book": book} for code, group in candidates for book in group]
    editions += [
        {"isbn_13": "9780679760801", "book": catalog_membership_book(5, is_partial_book=True)},
        {"isbn_13": "9780061120084", "book": catalog_membership_book(6, author=None)},
        {"isbn_13": "9780307465351", "book": catalog_membership_book(9, compilation=True)},
        {"isbn_13": "9780307474728", "book": catalog_membership_book(7, featured=False,
            book_series=[invalid_featured["featured_book_series"]])},
        {"isbn_13": "9780743273565", "book": catalog_membership_book(8, featured=False,
            book_series=[
                catalog_membership_book(8)["book_series"][0],
                {**catalog_membership_book(8)["book_series"][0], "series": {
                    "id": 82, "name": "Other series", "canonical_id": None}},
            ])},
    ]
    mock, _ = membership_transport(editions)
    requested = [catalog.model_copy(update={"isbn": code}) for code in (
        isbn, other, "9780679760801", "9780061120084", "9780307465351",
        "9780307474728", "9780743273565",
        "9780441172710",  # Bad check digit must not fall back to title matching.
    )]
    assert all(book.series is None for book in await enrich(monkeypatch, mock, requested))


@pytest.mark.asyncio
async def test_featured_series_takes_priority_but_alias_series_is_rejected(monkeypatch: pytest.MonkeyPatch):
    isbn = "9780441172719"
    other = "9780140328721"
    book = catalog_membership_book(1, position=2)
    book["book_series"].append({
        "position": 1, "compilation": False,
        "series": {"id": 99, "name": "Unrelated Series", "canonical_id": None},
    })
    alias = catalog_membership_book(2)
    alias["featured_book_series"]["series"]["canonical_id"] = 81
    alias["book_series"][0]["series"]["canonical_id"] = 81
    mock, _ = membership_transport([
        {"isbn_13": isbn, "book": book},
        {"isbn_13": other, "book": alias},
    ])
    catalog = BookResult(id="catalog", title="Dune", author="Frank Herbert", page_count=412,
                         cover_url=None, isbn=isbn)
    selected, rejected = await enrich(monkeypatch, mock, [
        catalog, catalog.model_copy(update={"isbn": other}),
    ])
    assert (selected.series.id, selected.series.position) == ("81", 2)
    assert rejected.series is None


@pytest.mark.asyncio
async def test_isbn_lookup_does_not_use_another_edition_isbn(monkeypatch: pytest.MonkeyPatch):
    catalog = BookResult(id="catalog", title="Dune", author="Frank Herbert", page_count=412,
                         cover_url=None, isbn="9780441172719")
    mock, _ = membership_transport([
        {"isbn_13": "9780140328721", "book": catalog_membership_book(1)},
    ])
    assert (await enrich(monkeypatch, mock, [catalog]))[0].series is None


@pytest.mark.asyncio
async def test_title_only_requires_exact_author_and_unique_book(monkeypatch: pytest.MonkeyPatch):
    catalog = BookResult(id="catalog", title=" DÚNE ", author="FRANK HERBERT", page_count=412, cover_url=None)
    mock, calls = membership_transport([], hits=[1, 2, 3], books=[
        catalog_membership_book(1, title="Dune", position=None),
        catalog_membership_book(2, title="Dune Messiah"),
        catalog_membership_book(3, title="Dune", author="Another Writer"),
    ])
    [matched] = await enrich(monkeypatch, mock, [catalog])
    assert matched.series.position is None
    assert [call["variables"] for call in calls] == [{"query": "Dune"}, {"ids": [1, 2, 3]}]
    ambiguous, _ = membership_transport([], hits=[1, 4], books=[
        catalog_membership_book(1), catalog_membership_book(4, position=0),
    ])
    assert (await enrich(monkeypatch, ambiguous, [catalog]))[0].series is None
    no_series = catalog_membership_book(4, featured=False, book_series=[])
    ambiguous_without_membership, _ = membership_transport([], hits=[1, 4], books=[
        catalog_membership_book(1), no_series,
    ])
    assert (await enrich(monkeypatch, ambiguous_without_membership, [catalog]))[0].series is None


@pytest.mark.asyncio
async def test_title_only_rejects_missing_author_and_malformed_response(monkeypatch: pytest.MonkeyPatch):
    catalog = BookResult(id="catalog", title="Dune", author="Frank Herbert", page_count=412, cover_url=None)
    mock, _ = membership_transport([], hits=[1], books=[catalog_membership_book(1, author=None)])
    assert (await enrich(monkeypatch, mock, [catalog]))[0].series is None
    compilation, _ = membership_transport([], hits=[2], books=[
        catalog_membership_book(2, compilation=True),
    ])
    assert (await enrich(monkeypatch, compilation, [catalog]))[0].series is None
    broken, _ = membership_transport([], fail="SearchBooks")
    with pytest.raises(SeriesProviderError):
        await enrich(monkeypatch, broken, [catalog])


@pytest.mark.asyncio
async def test_isbn_graphql_error_or_malformed_book_never_enriches(monkeypatch: pytest.MonkeyPatch):
    catalog = BookResult(id="catalog", title="Dune", author="Frank Herbert", page_count=412,
                         cover_url=None, isbn="9780441172719")
    outage, _ = membership_transport([], fail="EditionMemberships")
    with pytest.raises(SeriesProviderError):
        await enrich(monkeypatch, outage, [catalog])
    invalid_book = catalog_membership_book(1)
    invalid_book["id"] = "not-a-number"
    malformed, _ = membership_transport([{"isbn_13": catalog.isbn, "book": invalid_book}])
    with pytest.raises(SeriesProviderError, match="book ID"):
        await enrich(monkeypatch, malformed, [catalog])


@pytest.mark.asyncio
async def test_no_token_cannot_enrich_and_invalid_isbn_is_not_a_title_match(monkeypatch: pytest.MonkeyPatch):
    book = BookResult(id="catalog", title="Dune", author="Frank Herbert", page_count=412,
                      cover_url=None, isbn="9780441172710")
    mock, calls = membership_transport([], hits=[1], books=[catalog_membership_book(1)])
    assert (await enrich(monkeypatch, mock, [book]))[0].series is None
    assert calls == []
    monkeypatch.delenv("HARDCOVER_API_TOKEN", raising=False)
    assert await enrich_catalog_books("Dune", [book]) == [book]
    with pytest.raises(SeriesProviderError, match="not configured"):
        await enrich_catalog_books("Dune", [book.model_copy(update={"isbn": "9780441172719"})])
