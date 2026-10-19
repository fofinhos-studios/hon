import asyncio
import json
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from hon.main import app
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


def test_book_search_stream_previews_ten_distinct_works_before_complete_results(
    client: TestClient, catalogs,
):
    catalogs[2].return_value = [
        BOOK.model_copy(update={
            "id": f"bookinfo:{number}", "title": f"Dune {number}",
            "source": "bookinfo", "language": "pt",
        })
        for number in range(12)
    ]
    async def later_translation(_query: str):
        await asyncio.sleep(0.02)
        return [BOOK.model_copy(update={
            "id": "open:translation", "title": "Dune 0",
            "source": "open_library", "language": "en",
        })]

    catalogs[1].side_effect = later_translation

    response = client.get("/books/search?q=dune", headers={"Accept": "application/x-ndjson"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-ndjson")
    events = [json.loads(line) for line in response.text.splitlines()]
    assert events[0]["type"] == "snapshot"
    assert len({(book["title"], book["author"]) for book in events[0]["result"]["books"]}) == 10
    assert events[-1]["type"] == "final"
    assert len(events[-1]["result"]["books"]) == 13
    assert {book["language"] for book in events[-1]["result"]["books"] if book["title"] == "Dune 0"} == {
        "pt", "en",
    }
    assert all(book["page_count"] == 412 for book in events[-1]["result"]["books"])
    assert client.get("/books/search?q=dune").json() == events[-1]["result"]
    for catalog in catalogs[:4]:
        catalog.assert_awaited_once()


def test_stream_keeps_the_first_payload_small_when_one_work_has_many_editions(
    client: TestClient, catalogs,
):
    catalogs[2].return_value = [
        BOOK.model_copy(update={"id": str(index), "page_count": 200 + index})
        for index in range(30)
    ]
    response = client.get("/books/search?q=dune", headers={"Accept": "application/x-ndjson"})
    events = [json.loads(line) for line in response.text.splitlines()]
    assert events[0]["type"] == "snapshot"
    assert len(events[0]["result"]["books"]) <= 2
    assert len(events[-1]["result"]["books"]) == 30


@pytest.mark.parametrize("slow_delivery", [False, True])
@pytest.mark.asyncio
async def test_book_search_stream_sends_preview_while_open_library_is_still_pending(
    catalogs, monkeypatch: pytest.MonkeyPatch, slow_delivery: bool,
):
    if slow_delivery:
        monkeypatch.setattr("hon.routers.books.SEARCH_DEADLINE_SECONDS", 0.1)
    release_library = asyncio.Event()
    preview_sent = asyncio.Event()
    chunks: list[bytes] = []

    async def slow_library(_query: str):
        await release_library.wait()
        return [BOOK.model_copy(update={"id": "late", "title": "Dune 13"})]

    catalogs[1].side_effect = slow_library
    catalogs[2].return_value = [
        BOOK.model_copy(update={"id": str(number), "title": f"Dune {number}"})
        for number in range(12)
    ]

    async def receive():
        await asyncio.Event().wait()

    async def send(message):
        if message["type"] == "http.response.body" and message.get("body"):
            chunk = message["body"]
            chunks.append(chunk)
            if b'"snapshot"' in chunk:
                preview_sent.set()
                if slow_delivery:
                    await asyncio.sleep(0.25)

    scope = {
        "type": "http", "asgi": {"version": "3.0", "spec_version": "2.4"},
        "method": "GET", "scheme": "http", "root_path": "", "path": "/books/search",
        "raw_path": b"/books/search", "query_string": b"q=dune",
        "headers": [(b"accept", b"application/x-ndjson")],
        "client": ("127.0.0.1", 1234), "server": ("test", 80), "http_version": "1.1",
    }
    request = asyncio.create_task(app(scope, receive, send))
    try:
        await asyncio.wait_for(preview_sent.wait(), timeout=2)
        assert not release_library.is_set()
        assert not request.done()
        release_library.set()
        await asyncio.wait_for(request, timeout=2)
    finally:
        release_library.set()
        if not request.done():
            request.cancel()
            await asyncio.gather(request, return_exceptions=True)
    events = [json.loads(line) for line in b"".join(chunks).splitlines()]
    assert events[0]["type"] == "snapshot"
    assert events[-1]["type"] == "final"
    assert any(book["title"] == "Dune 13" for book in events[-1]["result"]["books"])
    for catalog in catalogs[:4]:
        catalog.assert_awaited_once()


def test_search_survives_a_provider_failure(client: TestClient, catalogs):
    google, library, _, _, _, _ = catalogs
    google.side_effect = httpx.DecodingError("bad")
    library.return_value = [BOOK]
    response = client.get("/books/search?q=dune")
    assert response.status_code == 200
    assert response.json()["source"] == "open_library"


@pytest.mark.parametrize(("error", "status"), [(httpx.ReadTimeout("timeout"), 504), (httpx.ConnectError("bad"), 502)])
def test_search_maps_outages(client: TestClient, catalogs, error, status):
    for catalog in catalogs[:4]:
        catalog.side_effect = error
    assert client.get("/books/search?q=dune").status_code == status

@pytest.mark.parametrize("query", ["The Wheel of Time", "Wheel of Time"])
def test_series_search_restricts_relevance_without_catalog_lookup(client: TestClient, catalogs, query):
    member = BOOK.model_copy(update={
        "id": "hardcover:17", "title": "The Eye of the World", "source": "hardcover",
        "series": SeriesMembership(id="5", name="The Wheel of Time", position=1),
    })
    catalogs[4].return_value = [
        SeriesResult(id="6", name="Wheel of Fortune", author="Another Writer", members=[], incomplete=False),
        SeriesResult(id="5", name="The Wheel of Time", author="Robert Jordan", members=[member], incomplete=False),
    ]
    response = client.get("/series/search", params={"q": query})
    assert response.status_code == 200
    assert response.json()["books"] == []
    assert [item["name"] for item in response.json()["series"]] == ["The Wheel of Time"]
    assert response.json()["series"][0]["members"][0]["series"]["position"] == 1
    assert response.json()["source"] == "hardcover"
    catalogs[4].assert_awaited_once_with(query)
    for catalog in (*catalogs[:4], catalogs[5]):
        catalog.assert_not_awaited()


@pytest.mark.parametrize(
    ("query", "series_name", "series_names"),
    [
        ("The Eye of the World", "Tales of Starlight", []),
        ("Wheel", "The Wheel of Time", ["The Wheel of Time"]),
        ("In the End", "The End", []),
    ],
)
def test_series_provider_results_are_filtered_without_catalog(
    client: TestClient, catalogs, monkeypatch, query, series_name, series_names,
):
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
            "id": 42, "slug": "starlight", "name": series_name, "author": {"name": "Another Writer"},
            "primary_books_count": 1,
            "book_series": [{"position": 1, "book": {
                "id": 17, "title": "First Tale", "pages": 250, "contributions": [],
                "default_physical_edition": None, "default_ebook_edition": None,
            }}],
        }]}})

    with patch("hon.services.hardcover.httpx.AsyncClient",
               side_effect=lambda **options: client_type(transport=httpx.MockTransport(handle), **options)):
        response = client.get("/series/search", params={"q": query})
    assert response.status_code == 200
    assert response.json()["books"] == []
    assert [item["name"] for item in response.json()["series"]] == series_names
    assert response.json()["source"] == "hardcover"
    assert response.json()["partial"] is False
    for catalog in (*catalogs[:4], catalogs[5]):
        catalog.assert_not_awaited()


def test_book_search_is_independent_of_series_outage(client: TestClient, catalogs):
    catalogs[0].return_value = [BOOK]
    catalogs[4].side_effect = SeriesProviderError("unauthorized")
    response = client.get("/books/search?q=dune")
    assert response.status_code == 200
    assert [book["title"] for book in response.json()["books"]] == ["Dune"]
    assert response.json()["series"] == []
    assert response.json()["partial"] is False
    catalogs[4].assert_not_awaited()


def test_empty_catalog_is_independent_of_missing_series_token(client: TestClient, catalogs):
    catalogs[4].side_effect = SeriesProviderError("missing token")
    response = client.get("/books/search?q=obscure")
    assert response.status_code == 200
    assert response.json()["books"] == []
    assert response.json()["series"] == []
    assert response.json()["partial"] is False
    catalogs[4].assert_not_awaited()

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
    book_response = client.get("/books/search?q=dune")
    assert book_response.status_code == 200
    assert book_response.json()["books"] == []
    assert book_response.json()["series"] == []
    catalogs[4].assert_not_awaited()
    response = client.get("/series/search?q=dune")
    assert response.status_code == 200
    assert response.json()["source"] == "hardcover"
    assert response.json()["books"] == []
    assert response.json()["series"][0]["members"][0]["id"] == "hardcover:17"


def test_search_validates_query(client: TestClient):
    for path in ("/books/search", "/series/search"):
        for params in ({}, {"q": "lo"}, {"q": "   "}, {"q": "..."}, {"q": "a" * 201}):
            assert client.get(path, params=params).status_code == 422


def test_search_strips_query(client: TestClient, catalogs):
    catalogs[0].return_value = [BOOK]
    assert client.get("/books/search", params={"q": "  dune  "}).status_code == 200
    catalogs[0].assert_awaited_once_with("dune")


def test_series_search_strips_query_and_uses_folded_cache(client: TestClient, catalogs):
    catalogs[4].return_value = [SeriesResult(
        id="5", name="Café", author="Writer", members=[], incomplete=False,
    )]
    assert client.get("/series/search", params={"q": "  Café  "}).status_code == 200
    cached = client.get("/series/search", params={"q": "cafe", "edition_type": "audiobook"})
    assert [item["id"] for item in cached.json()["series"]] == ["5"]
    catalogs[4].assert_awaited_once_with("Café")


@pytest.mark.parametrize(
    ("error", "status"),
    [(SeriesProviderError("missing token"), 502), (httpx.ConnectError("offline"), 502),
     (httpx.ReadTimeout("slow"), 504)],
)
def test_series_search_maps_provider_failures_without_catalog_fallback(client: TestClient, catalogs, error, status):
    catalogs[0].return_value = [BOOK]
    catalogs[4].side_effect = error
    assert client.get("/series/search?q=dune").status_code == status
    catalogs[0].assert_not_awaited()
    catalogs[5].assert_not_awaited()
    catalogs[4].side_effect = None
    catalogs[4].return_value = []
    assert client.get("/series/search?q=dune").status_code == 200
    assert catalogs[4].await_count == 2


def test_series_search_enforces_timeout(client: TestClient, catalogs):
    async def slow_search(_query):
        await asyncio.sleep(1)

    catalogs[4].side_effect = slow_search
    with patch("hon.routers.books.SERIES_TIMEOUT_SECONDS", 0.01):
        assert client.get("/series/search?q=dune").status_code == 504
    for catalog in (*catalogs[:4], catalogs[5]):
        catalog.assert_not_awaited()


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


def test_edition_filter_validates_and_returns_matching_results(client: TestClient, catalogs):
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
    assert len(client.get("/books/search?q=dune").json()["books"]) == 3
    assert len(client.get("/books/search?q=dune&edition_type=unspecified").json()["books"]) == 0


def test_edition_switch_uses_complete_search_during_provider_outage(client: TestClient, catalogs):
    physical = BOOK.model_copy(update={
        "source": "google_books", "format": "physical", "cover_url": "https://example.test/cover.jpg",
    })
    digital = BOOK.model_copy(update={"id": "digital", "format": "digital", "isbn": "9780441172719"})
    audio = AudiobookResult(
        id="audio", title="Dune", author="Frank Herbert", duration_minutes=330,
    )
    catalogs[0].return_value = [physical, digital]
    catalogs[3].return_value = [audio]
    initial = client.get("/books/search?q=dune")
    assert initial.status_code == 200
    editions = initial.json()["books"]
    for catalog in catalogs[:4]:
        catalog.side_effect = httpx.ReadTimeout("catalog unavailable")

    for kind in ("physical", "digital", "audiobook"):
        response = client.get("/books/search", params={"q": "dune", "edition_type": kind})
        assert response.status_code == 200
        assert response.json()["partial"] is False
        if kind == "audiobook":
            expected = [book for book in editions if book["kind"] == "audiobook"]
        else:
            expected = [book for book in editions if book["kind"] == "page" and book["format"] == kind]
        assert response.json()["books"] == expected


def test_derived_filter_preserves_open_library_fallback_source(client: TestClient, catalogs):
    catalogs[0].return_value = [BOOK.model_copy(update={
        "id": "digital", "source": "google_books", "title": "Digital Dune", "format": "digital",
    })]
    catalogs[1].return_value = [BOOK.model_copy(update={
        "id": "open", "source": "open_library", "format": "physical",
    })]
    assert client.get("/books/search?q=dune").json()["source"] == "combined"

    filtered = client.get("/books/search?q=dune&edition_type=physical")
    assert filtered.status_code == 200
    assert [book["id"] for book in filtered.json()["books"]] == ["open"]
    assert filtered.json()["source"] == "open_library"


def test_filtered_search_does_not_report_membership_failure_for_other_formats(
    client: TestClient, catalogs,
):
    catalogs[0].return_value = [BOOK.model_copy(update={
        "source": "google_books", "format": "digital",
    })]
    catalogs[5].side_effect = SeriesProviderError("Hardcover unavailable")

    response = client.get("/books/search?q=dune&edition_type=physical")
    assert response.status_code == 200
    assert response.json()["books"] == []
    assert response.json()["partial"] is False


def test_partial_full_search_does_not_hide_recovered_audiobooks(client: TestClient, catalogs):
    catalogs[0].return_value = [BOOK]
    catalogs[3].side_effect = httpx.ReadTimeout("audio unavailable")
    assert client.get("/books/search?q=dune").json()["partial"] is True

    catalogs[3].side_effect = None
    catalogs[3].return_value = [AudiobookResult(
        id="audio", title="Dune", author="Frank Herbert", duration_minutes=330,
    )]
    recovered = client.get("/books/search?q=dune&edition_type=audiobook")
    assert recovered.status_code == 200
    assert [book["id"] for book in recovered.json()["books"]] == ["audio"]
    assert recovered.json()["partial"] is False


def test_series_members_remain_only_in_series_response_without_truncation(client: TestClient, catalogs):
    members = [
        BOOK.model_copy(update={
            "id": f"hardcover:{number}", "source": "hardcover", "title": f"Dune Volume {number}",
            "series": SeriesMembership(id="5", name="Dune", position=number),
        })
        for number in range(1, 106)
    ]
    catalogs[4].return_value = [SeriesResult(
        id="5", name="Dune", author="Frank Herbert", members=members, incomplete=False,
    )]
    response = client.get("/series/search?q=dune")
    assert response.status_code == 200
    assert response.json()["books"] == []
    assert [book["id"] for book in response.json()["series"][0]["members"]] == [book.id for book in members]
    for catalog in (*catalogs[:4], catalogs[5]):
        catalog.assert_not_awaited()


def test_book_search_never_includes_series_members_or_uses_series_cache(client: TestClient, catalogs):
    catalog = BOOK.model_copy(update={
        "id": "catalog", "source": "google_books", "isbn": "9780441172719",
        "cover_url": "https://cover.test/catalog",
    })
    member = catalog.model_copy(update={
        "id": "hardcover:7", "source": "hardcover",
        "series": SeriesMembership(id="5", name="Dune", position=1),
    })
    catalogs[0].return_value = [catalog]
    catalogs[4].return_value = [SeriesResult(
        id="5", name="Dune", author="Frank Herbert", members=[member], incomplete=False,
    )]
    series_response = client.get("/series/search?q=dune")
    assert series_response.json()["books"] == []
    assert series_response.json()["series"][0]["members"][0]["id"] == "hardcover:7"
    response = client.get("/books/search?q=dune")
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["books"]] == ["catalog"]
    assert response.json()["series"] == []
    assert response.json()["books"][0]["series"] is None
    catalogs[4].assert_awaited_once_with("dune")
    catalogs[5].assert_awaited_once()


def test_series_search_ranks_exact_title_before_partial_matches(client: TestClient, catalogs):
    catalogs[4].return_value = [
        SeriesResult(id="1", name="Dune Chronicles", author="A", members=[], incomplete=False),
        SeriesResult(id="2", name="The Dune", author="B", members=[], incomplete=False),
        SeriesResult(id="3", name="Legend of Dunedin", author="C", members=[], incomplete=False),
        SeriesResult(id="4", name="Beyond Dune", author="D", members=[], incomplete=False),
    ]
    response = client.get("/series/search?q=dune")
    assert [item["id"] for item in response.json()["series"]] == ["2", "1", "4"]


def test_book_edition_filter_does_not_limit_series_members(client: TestClient, catalogs):
    members = [
        BOOK.model_copy(update={"id": f"hardcover:{kind}", "format": kind})
        for kind in ("physical", "digital")
    ]
    catalogs[4].return_value = [SeriesResult(
        id="5", name="Dune", author="Frank Herbert", members=members, incomplete=False,
    )]
    books = client.get("/books/search?q=dune&edition_type=physical")
    assert books.status_code == 200
    assert books.json()["books"] == []
    assert books.json()["series"] == []
    series = client.get("/series/search?q=dune")
    assert [item["id"] for item in series.json()["series"][0]["members"]] == [
        "hardcover:physical", "hardcover:digital",
    ]
    assert series.json()["series"][0]["incomplete"] is False


def test_unusable_catalog_entries_are_not_flat_books(client: TestClient, catalogs):
    empty = BOOK.model_copy(update={
        "id": "empty", "author": "Unknown", "page_count": None,
        "cover_fallback_url": "https://fallback.test/cover",
    })
    catalogs[0].return_value = [empty, BOOK]
    response = client.get("/books/search?q=dune")
    assert [item["id"] for item in response.json()["books"]] == ["1"]
    assert response.json()["series"] == []


def test_book_search_omits_pageless_editions_after_merging_catalogs(client: TestClient, catalogs):
    google, library, _, audio, _, _ = catalogs
    google.return_value = [
        BOOK.model_copy(update={
            "id": "discworld", "title": "Discworld", "author": "Terry Pratchett",
            "page_count": None, "publisher": "Psygnosis",
        }),
        BOOK.model_copy(update={
            "id": "wyrd", "title": "Wyrd Sisters (Discworld Novels)", "author": "Terry Pratchett",
            "page_count": None, "cover_url": "https://example.test/wyrd.jpg",
            "publisher": "ISIS Audio Books", "isbn": "9780753123171",
        }),
        BOOK.model_copy(update={
            "id": "guards", "title": "Guards! Guards! (Discworld)", "author": "Terry Pratchett",
            "page_count": None, "format": "physical", "isbn": "9780061120084",
            "cover_url": "https://example.test/guards.jpg",
        }),
        BOOK.model_copy(update={
            "id": "mort", "title": "Mort (Discworld)", "author": "Terry Pratchett",
            "page_count": 240, "format": "physical",
            "cover_url": "https://example.test/mort.jpg",
        }),
    ]
    library.return_value = [BOOK.model_copy(update={
        "id": "guards-library", "source": "open_library",
        "title": "Guards! Guards! (Discworld)", "author": "Terry Pratchett",
        "page_count": 320, "format": "physical", "isbn": "9780061120084",
    })]
    audio.return_value = [AudiobookResult(
        id="audio:discworld", title="Discworld narrated", author="Terry Pratchett",
        duration_minutes=540,
    )]

    response = client.get("/books/search?q=discworld")
    assert response.status_code == 200
    books = response.json()["books"]
    assert {book["title"] for book in books} == {
        "Mort (Discworld)", "Guards! Guards! (Discworld)", "Discworld narrated",
    }
    guards = next(book for book in books if book["title"] == "Guards! Guards! (Discworld)")
    assert (guards["page_count"], guards["cover_url"]) == (320, "https://example.test/guards.jpg")
    assert next(book for book in books if book["kind"] == "audiobook")["duration_minutes"] == 540
    physical = client.get("/books/search?q=discworld&edition_type=physical")
    assert {book["title"] for book in physical.json()["books"]} == {
        "Mort (Discworld)", "Guards! Guards! (Discworld)",
    }


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
