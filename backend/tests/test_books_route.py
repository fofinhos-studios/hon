import asyncio
import json
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from hon.models.book import AudiobookResult, BookResult, SeriesMembership, SeriesResult
from hon.routers.books import _cache
from hon.services.hardcover import SeriesProviderError, enrich_catalog_books, search_series

BOOK = BookResult(id="1", title="Dune", author="Frank Herbert", page_count=412, cover_url=None)


@pytest.fixture(autouse=True)
def catalogs():
    _cache.clear()
    with (
        patch("hon.routers.books.search_google_books", AsyncMock(return_value=[])) as google,
        patch("hon.routers.books.search_open_library", AsyncMock(return_value=[])) as library,
        patch("hon.routers.books.search_bookinfo", AsyncMock(return_value=[])) as bookinfo,
        patch("hon.routers.books.search_audiosilo", AsyncMock(return_value=[])) as audio,
        patch("hon.routers.books.search_series", AsyncMock(return_value=[])) as series,
        patch("hon.routers.books.enrich_catalog_books", AsyncMock(side_effect=lambda query, books: books)) as enrich,
    ):
        yield google, library, bookinfo, audio, series, enrich
    _cache.clear()


def test_health_reports_service_status(client: TestClient):
    assert client.get("/health").json() == {"status": "ok"}


def test_search_combines_catalogs_and_keeps_distinct_editions(client: TestClient, catalogs):
    google, library, bookinfo, _, _, _ = catalogs
    google.return_value = [BOOK]
    bookinfo.return_value = [BOOK.model_copy(update={"id": "2", "publisher": "Other edition"})]
    response = client.get("/books/search?q=dune")
    assert response.status_code == 200
    assert response.json()["source"] == "combined"
    assert len(response.json()["books"]) == 2
    library.assert_awaited_once_with("dune")


def test_search_survives_a_provider_failure(client: TestClient, catalogs):
    google, library, _, _, _, _ = catalogs
    google.side_effect = httpx.DecodingError("bad")
    library.return_value = [BOOK]
    response = client.get("/books/search?q=dune")
    assert response.status_code == 200
    assert response.json()["source"] == "open_library"


@pytest.mark.parametrize(("error", "status"), [(httpx.ReadTimeout("timeout"), 504), (httpx.ConnectError("bad"), 502)])
def test_search_maps_outages(client: TestClient, catalogs, error, status):
    for catalog in catalogs:
        catalog.side_effect = error
    assert client.get("/books/search?q=dune").status_code == status

@pytest.mark.parametrize("query", ["The Wheel of Time", "Wheel of Time"])
def test_plain_search_returns_series_before_ordinary_books(client: TestClient, catalogs, query):
    member = BOOK.model_copy(
        update={
            "id": "hardcover:17",
            "title": "The Eye of the World",
            "source": "hardcover",
            "series": SeriesMembership(id="5", name="The Wheel of Time", position=1),
        }
    )
    unrelated = member.model_copy(update={
        "id": "hardcover:18",
        "series": SeriesMembership(id="6", name="Wheel of Fortune", position=1),
    })
    catalogs[4].return_value = [
        SeriesResult(id="5", name="The Wheel of Time", author="Robert Jordan", members=[member], incomplete=False),
        SeriesResult(id="6", name="Wheel of Fortune", author="Another Writer", members=[unrelated], incomplete=False),
    ]
    catalogs[0].return_value = [BOOK.model_copy(update={"title": query})]
    response = client.get("/books/search", params={"q": query})
    assert response.status_code == 200
    assert [item["name"] for item in response.json()["series"]] == ["The Wheel of Time"]
    assert response.json()["series"][0]["members"][0]["series"]["position"] == 1
    assert response.json()["books"][0]["title"] == query
    catalogs[4].assert_awaited_once_with(query)


@pytest.mark.parametrize(
    ("query", "catalog_title", "series_name", "book_titles", "series_names", "source"),
    [
        ("The Eye of the World", "The Eye of the World", "Tales of Starlight",
         ["The Eye of the World"], [], "google_books"),
        ("Wheel", None, "The Wheel of Time", ["First Tale"], ["The Wheel of Time"], "hardcover"),
        ("In the End", "In the End", "The End", ["In the End"], [], "google_books"),
    ],
)
def test_exact_book_title_excludes_unrelated_series_but_partial_series_remains(
    client: TestClient, catalogs, monkeypatch, query, catalog_title, series_name, book_titles, series_names, source,
):
    catalogs[0].return_value = (
        [BOOK.model_copy(update={"title": catalog_title, "author": "Robert Jordan"})]
        if catalog_title else []
    )
    catalogs[4].side_effect = search_series
    monkeypatch.setenv("HARDCOVER_API_TOKEN", "private-test-token")
    client_type = httpx.AsyncClient

    def handle(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        if "SearchSeries" in payload["query"]:
            return httpx.Response(200, json={"data": {"search": {"results": {
                "hits": [{"document": {"slug": "starlight"}}],
            }}}})
        return httpx.Response(200, json={"data": {"series": [{
            "id": 42, "name": series_name, "author": {"name": "Another Writer"},
            "primary_books_count": 1,
            "book_series": [{"position": 1, "book": {
                "id": 17, "title": "First Tale", "pages": 250, "contributions": [],
                "default_physical_edition": None, "default_ebook_edition": None,
            }}],
        }]}})

    with patch("hon.services.hardcover.httpx.AsyncClient",
               side_effect=lambda **options: client_type(transport=httpx.MockTransport(handle), **options)):
        response = client.get("/books/search", params={"q": query})
    assert response.status_code == 200
    assert [book["title"] for book in response.json()["books"]] == book_titles
    assert [item["name"] for item in response.json()["series"]] == series_names
    assert response.json()["source"] == source
    assert response.json()["partial"] is False


def test_search_preserves_ordinary_books_when_series_fails(client: TestClient, catalogs):
    catalogs[0].return_value = [BOOK]
    catalogs[4].side_effect = SeriesProviderError("unauthorized")
    response = client.get("/books/search?q=dune")
    assert response.status_code == 200
    assert response.json()["books"][0]["title"] == "Dune"
    assert response.json()["series"] == []
    assert response.json()["partial"] is True


def test_empty_catalog_stays_available_when_series_token_missing(client: TestClient, catalogs):
    catalogs[4].side_effect = SeriesProviderError("missing token")
    response = client.get("/books/search?q=obscure")
    assert response.status_code == 200
    assert response.json()["books"] == []
    assert response.json()["series"] == []
    assert response.json()["partial"] is True


def test_catalog_isbn_enrichment_round_trip_and_failed_enrichment(client: TestClient, catalogs, monkeypatch):
    isbn = "9780441172719"
    catalog = BOOK.model_copy(update={
        "source": "google_books", "isbn": isbn, "format": "physical",
        "cover_url": "https://example.test/cover.jpg",
    })
    catalogs[0].return_value = [catalog]
    catalogs[5].side_effect = enrich_catalog_books
    monkeypatch.setenv("HARDCOVER_API_TOKEN", "private-test-token")
    client_type = httpx.AsyncClient
    unavailable = False

    def handle(request: httpx.Request) -> httpx.Response:
        if unavailable:
            return httpx.Response(401)
        payload = json.loads(request.content)
        assert "EditionMemberships" in payload["query"]
        assert payload["variables"] == {"isbns": [isbn]}
        return httpx.Response(200, json={"data": {"editions": [{"isbn_13": isbn, "book": {
            "id": 81, "title": "Dune", "canonical_id": None, "is_partial_book": False,
            "compilation": False,
            "contributions": [{"contribution": "Author", "author": {"name": "Frank Herbert"}}],
            "featured_book_series": {"position": 1, "compilation": False,
                "series": {"id": 31, "name": "Dune Saga", "canonical_id": None}},
            "book_series": [],
        }}]}})

    with patch("hon.services.hardcover.httpx.AsyncClient",
               side_effect=lambda **options: client_type(transport=httpx.MockTransport(handle), **options)):
        response = client.get("/books/search?q=dune")
        _cache.clear()
        unavailable = True
        failed = client.get("/books/search?q=dune")
    assert response.status_code == 200
    enriched = response.json()["books"][0]
    assert enriched["series"] == {"id": "31", "name": "Dune Saga", "position": 1}
    assert enriched["id"] == catalog.id
    assert enriched["source"] == catalog.source
    assert enriched["format"] == catalog.format
    assert enriched["page_count"] == catalog.page_count
    assert enriched["cover_url"] == catalog.cover_url
    assert response.json()["partial"] is False

    assert failed.status_code == 200
    assert failed.json()["books"][0]["series"] is None
    assert failed.json()["partial"] is True


def test_missing_token_leaves_existing_catalog_editions_intact(client: TestClient, catalogs, monkeypatch):
    catalog = BOOK.model_copy(update={"isbn": "9780441172719", "source": "google_books"})
    catalogs[0].return_value = [catalog]
    catalogs[4].side_effect = SeriesProviderError("not configured")
    catalogs[5].side_effect = enrich_catalog_books
    monkeypatch.delenv("HARDCOVER_API_TOKEN", raising=False)
    response = client.get("/books/search?q=dune")
    assert response.status_code == 200
    assert response.json()["books"][0]["isbn"] == catalog.isbn
    assert response.json()["books"][0]["series"] is None
    assert response.json()["partial"] is True


def test_title_only_route_uses_unique_credited_book(client: TestClient, catalogs, monkeypatch):
    catalogs[0].return_value = [BOOK.model_copy(update={"isbn": None, "source": "google_books"})]
    catalogs[5].side_effect = enrich_catalog_books
    monkeypatch.setenv("HARDCOVER_API_TOKEN", "private-test-token")
    client_type = httpx.AsyncClient
    ids = [1]

    def handle(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        if "SearchBooks" in payload["query"]:
            return httpx.Response(200, json={"data": {"search": {"ids": ids}}})
        assert "BookMemberships" in payload["query"]
        assert payload["variables"] == {"ids": ids}
        return httpx.Response(200, json={"data": {"books": [{
            "id": book_id, "title": "Dune", "canonical_id": None, "is_partial_book": False,
            "compilation": False,
            "contributions": [{"contribution": "Author", "author": {"name": "Frank Herbert"}}],
            "featured_book_series": {"position": None, "compilation": False,
                "series": {"id": 31, "name": "Dune Saga", "canonical_id": None}},
            "book_series": [],
        } for book_id in ids]}})

    with patch("hon.services.hardcover.httpx.AsyncClient",
               side_effect=lambda **options: client_type(transport=httpx.MockTransport(handle), **options)):
        unique = client.get("/books/search?q=dune")
        assert unique.json()["books"][0]["series"] == {
            "id": "31", "name": "Dune Saga", "position": None,
        }
        _cache.clear()
        ids.append(2)
        ambiguous = client.get("/books/search?q=dune")
        assert ambiguous.status_code == 200
        assert ambiguous.json()["books"][0]["series"] is None
        assert ambiguous.json()["partial"] is False


def test_series_only_search_is_successful(client: TestClient, catalogs):
    member = BOOK.model_copy(
        update={
            "id": "hardcover:17",
            "source": "hardcover",
            "series": SeriesMembership(id="5", name="Dune", position=1),
        }
    )
    catalogs[4].return_value = [
        SeriesResult(id="5", name="Dune", author="Frank Herbert", members=[member], incomplete=False)
    ]
    response = client.get("/books/search?q=dune")
    assert response.status_code == 200
    assert response.json()["source"] == "hardcover"
    assert [book["id"] for book in response.json()["books"]] == ["hardcover:17"]
    assert response.json()["series"][0]["members"][0]["id"] == "hardcover:17"


def test_search_validates_query(client: TestClient):
    for params in ({}, {"q": "lo"}, {"q": "   "}, {"q": "..."}, {"q": "a" * 201}):
        assert client.get("/books/search", params=params).status_code == 422


def test_search_strips_query(client: TestClient, catalogs):
    catalogs[0].return_value = [BOOK]
    assert client.get("/books/search", params={"q": "  dune  "}).status_code == 200
    catalogs[0].assert_awaited_once_with("dune")


def test_search_cache_ignores_accents_and_case(client: TestClient, catalogs):
    book = BOOK.model_copy(update={"title": "Café", "language": "pt"})
    catalogs[2].return_value = [book]
    client.get("/books/search", params={"q": "café"})
    client.get("/books/search", params={"q": "CAFE"})
    assert catalogs[2].await_count == 1
    response = client.get("/books/search", params={"q": "cafe"})
    assert catalogs[2].await_count == 1
    assert response.json()["books"][0]["title"] == "Café"


def test_search_has_no_implicit_language_filter(client: TestClient, catalogs):
    catalogs[0].return_value = [BOOK.model_copy(update={"id": "en", "language": "en"})]
    catalogs[2].return_value = [BOOK.model_copy(update={"id": "pt", "language": "pt"})]
    response = client.get("/books/search", params={"q": "dune"})
    assert {b["language"] for b in response.json()["books"]} == {"en", "pt"}


def test_search_groups_languages_and_keeps_distinct_recordings(client: TestClient, catalogs):
    page = BOOK.model_copy(update={"id": "print", "source": "google_books", "language": "en"})
    audio = AudiobookResult(
        id="audiosilo:work:recording-1",
        title="Dune",
        author="Frank Herbert",
        duration_minutes=300,
        cover_url=None,
        language="en",
        isbn="9780441172719",
    )
    catalogs[0].return_value = [page]
    catalogs[3].return_value = [
        audio,
        audio.model_copy(update={"id": "audiosilo:work:recording-2", "duration_minutes": 330}),
    ]
    catalogs[2].return_value = [page.model_copy(update={"id": "pt", "language": "pt", "source": "bookinfo"})]
    response = client.get("/books/search?q=dune")
    assert response.status_code == 200
    editions = response.json()["books"]
    assert len(editions) == 4
    assert len({book["id"] for book in editions if book["kind"] == "audiobook"}) == 2
    assert len({book["work_key"] for book in editions}) == 2
    assert all(book["format"] == "unspecified" for book in editions if book["kind"] == "page")


def test_search_survives_audio_outage(client: TestClient, catalogs):
    catalogs[0].return_value = [BOOK]
    catalogs[3].side_effect = httpx.ReadTimeout("audio unavailable")
    response = client.get("/books/search?q=dune")
    assert response.status_code == 200
    assert response.json()["partial"] is True
    assert response.json()["books"][0]["kind"] == "page"


def test_search_enforces_total_deadline(client: TestClient, catalogs):
    async def slow_search(*_args):
        await asyncio.sleep(1)

    catalogs[0].side_effect = slow_search
    with patch("hon.routers.books.SEARCH_DEADLINE_SECONDS", 0.01):
        assert client.get("/books/search?q=dune").status_code == 504


def test_edition_filter_validates_and_caches_each_subset(client: TestClient, catalogs):
    page = BOOK.model_copy(update={"source": "google_books", "format": "physical"})
    digital = page.model_copy(update={"id": "digital", "format": "digital", "isbn": "9780441172719"})
    audio = AudiobookResult(id="audio", title="Dune", author="Frank Herbert",
                            duration_minutes=330, cover_url=None)
    catalogs[0].return_value = [page, digital]
    catalogs[3].return_value = [audio]
    for kind, expected in (("physical", "1"), ("digital", "digital"), ("audiobook", "audio")):
        response = client.get("/books/search", params={"q": "dune", "edition_type": kind})
        assert response.status_code == 200
        assert [item["id"] for item in response.json()["books"]] == [expected]
    assert client.get("/books/search", params={"q": "dune", "edition_type": "print"}).status_code == 422
    assert catalogs[3].await_count == 1
    assert len(client.get("/books/search?q=dune").json()["books"]) == 3
    assert len(client.get("/books/search?q=dune&edition_type=unspecified").json()["books"]) == 0
    client.get("/books/search?q=dune&edition_type=physical")
    assert catalogs[0].await_count == 4


def test_series_books_keep_all_paginated_volumes_beyond_catalog_cutoff(client: TestClient, catalogs):
    members = [
        BOOK.model_copy(update={
            "id": f"hardcover:{number}", "source": "hardcover", "title": f"Dune Volume {number}",
            "series": SeriesMembership(id="5", name="Dune", position=number),
        })
        for number in range(1, 106)
    ]
    catalogs[4].return_value = [SeriesResult(id="5", name="Dune", author="Frank Herbert",
                                             members=members, incomplete=False)]
    response = client.get("/books/search?q=dune")
    assert response.status_code == 200
    assert len(response.json()["series"][0]["members"]) == 105
    assert len(response.json()["books"]) == 105
    assert {book["id"] for book in response.json()["books"]} == {book.id for book in members}
    assert all(book["series"]["id"] == "5" for book in response.json()["books"])


def test_series_member_merges_catalog_isbn_and_keeps_membership(client: TestClient, catalogs):
    isbn = "9780441172719"
    catalog = BOOK.model_copy(update={"id": "catalog", "source": "google_books", "isbn": isbn,
                                       "cover_url": "https://cover.test/catalog"})
    member = catalog.model_copy(update={"id": "hardcover:7", "source": "hardcover", "cover_url": None,
                                        "series": SeriesMembership(id="5", name="Dune", position=1)})
    catalogs[0].return_value = [catalog]
    catalogs[4].return_value = [SeriesResult(id="5", name="Dune", author="Frank Herbert",
                                             members=[member], incomplete=False)]
    response = client.get("/books/search?q=dune")
    assert response.status_code == 200
    assert len(response.json()["books"]) == 1
    merged = response.json()["books"][0]
    assert merged["id"] == "catalog"
    assert merged["cover_url"] == catalog.cover_url
    assert merged["series"]["position"] == 1


def test_series_positions_with_reused_isbn_do_not_collapse(client: TestClient, catalogs):
    members = [
        BOOK.model_copy(update={
            "id": f"hardcover:{position}", "source": "hardcover",
            "title": f"Dune Volume {position}", "isbn": "9780441172719",
            "series": SeriesMembership(id="5", name="Dune", position=position),
        })
        for position in (1, 2)
    ]
    catalogs[4].return_value = [SeriesResult(id="5", name="Dune", author="Frank Herbert",
                                             members=members, incomplete=False)]
    response = client.get("/books/search?q=dune")
    assert len(response.json()["books"]) == 2
    assert {book["series"]["position"] for book in response.json()["books"]} == {1, 2}


def test_series_member_without_isbn_enriches_unique_catalog_work(client: TestClient, catalogs):
    catalog = BOOK.model_copy(update={"id": "catalog", "source": "google_books",
                                       "cover_url": "https://cover.test/catalog"})
    member = catalog.model_copy(update={"id": "hardcover:7", "source": "hardcover",
                                        "cover_url": None, "series": SeriesMembership(id="5", name="Dune", position=1)})
    catalogs[0].return_value = [catalog]
    catalogs[4].return_value = [SeriesResult(id="5", name="Dune", author="Frank Herbert",
                                             members=[member], incomplete=False)]
    response = client.get("/books/search?q=dune")
    assert [book["id"] for book in response.json()["books"]] == ["catalog"]
    assert response.json()["books"][0]["series"]["id"] == "5"
    assert response.json()["books"][0]["cover_url"] == catalog.cover_url


@pytest.mark.parametrize(
    ("catalog_update", "member_update"),
    [
        ({"page_count": 380}, {"page_count": 412}),
        ({"format": "digital"}, {"format": "physical"}),
    ],
)
@pytest.mark.parametrize("catalog_isbn", [None, "9780441172719"])
def test_isbnless_series_member_does_not_attach_to_conflicting_catalog_edition(
    client: TestClient, catalogs, catalog_update, member_update, catalog_isbn,
):
    catalog = BOOK.model_copy(update={
        "id": "catalog", "source": "google_books", "language": "en",
        "isbn": catalog_isbn, **catalog_update,
    })
    member = BOOK.model_copy(update={
        "id": "hardcover:7", "source": "hardcover", "language": "en",
        "series": SeriesMembership(id="5", name="Dune", position=1), **member_update,
    })
    catalogs[0].return_value = [catalog]
    catalogs[4].return_value = [SeriesResult(
        id="5", name="Dune", author="Frank Herbert", members=[member], incomplete=False,
    )]

    response = client.get("/books/search?q=dune")
    assert response.status_code == 200
    editions = {book["id"]: book for book in response.json()["books"]}
    assert set(editions) == {"catalog", "hardcover:7"}
    assert editions["catalog"]["series"] is None
    assert editions["hardcover:7"]["series"]["position"] == 1
    assert editions["catalog"]["work_key"] == editions["hardcover:7"]["work_key"]


@pytest.mark.parametrize("catalog_isbn", [None, "9780441172719"])
def test_isbnless_series_member_with_matching_edition_metadata_merges(
    client: TestClient, catalogs, catalog_isbn,
):
    catalog = BOOK.model_copy(update={
        "id": "catalog", "source": "google_books", "language": "en", "isbn": catalog_isbn,
        "format": "physical", "cover_url": "https://cover.test/catalog",
    })
    member = catalog.model_copy(update={
        "id": "hardcover:7", "source": "hardcover", "cover_url": None, "isbn": None,
        "series": SeriesMembership(id="5", name="Dune", position=1),
    })
    catalogs[0].return_value = [catalog]
    catalogs[4].return_value = [SeriesResult(
        id="5", name="Dune", author="Frank Herbert", members=[member], incomplete=False,
    )]

    response = client.get("/books/search?q=dune")
    assert response.status_code == 200
    assert [book["id"] for book in response.json()["books"]] == ["catalog"]
    assert response.json()["books"][0]["series"]["position"] == 1
    assert response.json()["books"][0]["cover_url"] == catalog.cover_url


@pytest.mark.parametrize(
    ("edition_type", "expected_member"),
    [("physical", "hardcover:physical"), ("digital", "hardcover:digital"),
     ("unspecified", "hardcover:unspecified")],
)
def test_edition_filter_excludes_other_formats_from_series_and_flat_books(
    client: TestClient, catalogs, edition_type, expected_member,
):
    members = [
        BOOK.model_copy(update={
            "id": f"hardcover:{format_name}", "source": "hardcover",
            "title": f"Dune Volume {position}", "format": format_name,
            "series": SeriesMembership(id="5", name="Dune", position=position),
        })
        for position, format_name in enumerate(("physical", "digital", "unspecified"), start=1)
    ]
    physical_only = BOOK.model_copy(update={
        "id": "hardcover:other", "source": "hardcover", "format": "physical",
        "title": "Dune Companion",
        "series": SeriesMembership(id="6", name="Dune", position=1),
    })
    catalogs[4].return_value = [
        SeriesResult(id="5", name="Dune", author="Frank Herbert", members=members, incomplete=False),
        SeriesResult(id="6", name="Dune", author="Frank Herbert", members=[physical_only], incomplete=False),
    ]

    response = client.get("/books/search", params={"q": "dune", "edition_type": edition_type})
    assert response.status_code == 200
    series = {item["id"]: item for item in response.json()["series"]}
    assert [member["id"] for member in series["5"]["members"]] == [expected_member]
    assert series["5"]["incomplete"] is True
    assert set(series) == ({"5", "6"} if edition_type == "physical" else {"5"})
    if edition_type == "physical":
        assert series["6"]["incomplete"] is False
    expected_books = {expected_member} | ({"hardcover:other"} if edition_type == "physical" else set())
    assert {book["id"] for book in response.json()["books"]} == expected_books

    unfiltered = client.get("/books/search?q=dune").json()
    assert [member["id"] for member in unfiltered["series"][0]["members"]] == [
        member.id for member in members
    ]
    assert unfiltered["series"][0]["incomplete"] is False
    assert {item["id"] for item in unfiltered["series"]} == {"5", "6"}


def test_unusable_catalog_and_series_entries_are_not_flat_books(client: TestClient, catalogs):
    empty = BOOK.model_copy(update={"id": "empty", "author": "Unknown", "page_count": None,
                                    "cover_fallback_url": "https://fallback.test/cover"})
    catalogs[0].return_value = [empty, BOOK]
    catalogs[4].return_value = [SeriesResult(id="5", name="Dune", author="Unknown",
                                             members=[empty], incomplete=True)]
    response = client.get("/books/search?q=dune")
    assert [item["id"] for item in response.json()["books"]] == ["1"]
    assert response.json()["series"][0]["members"][0]["id"] == "empty"


def test_enrichment_is_bounded_without_truncating_catalog_results(client: TestClient, catalogs):
    catalogs[0].return_value = [
        BOOK.model_copy(update={"id": str(number), "title": f"Dune Volume {number}"})
        for number in range(1, 26)
    ]
    response = client.get("/books/search?q=dune")
    assert response.status_code == 200
    assert len(response.json()["books"]) == 25
    assert len(catalogs[5].await_args.args[1]) == 12


def test_slow_provider_returns_available_catalog_with_partial_status(client: TestClient, catalogs):
    async def never_returns(_query):
        await asyncio.sleep(1)

    catalogs[0].return_value = [BOOK]
    catalogs[1].side_effect = never_returns
    with patch("hon.routers.books.CATALOG_TIMEOUT_SECONDS", 0.01):
        response = client.get("/books/search?q=dune")
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["books"]] == ["1"]
    assert response.json()["partial"] is True
