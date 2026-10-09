import asyncio
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from hon.models.book import AudiobookResult, BookResult, SeriesMembership, SeriesResult
from hon.routers.books import _cache
from hon.services.hardcover import SeriesProviderError

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
    ):
        yield google, library, bookinfo, audio, series
    _cache.clear()


def test_health_reports_service_status(client: TestClient):
    assert client.get("/health").json() == {"status": "ok"}


def test_search_combines_catalogs_and_keeps_distinct_editions(client: TestClient, catalogs):
    google, library, bookinfo, _, _ = catalogs
    google.return_value = [BOOK]
    bookinfo.return_value = [BOOK.model_copy(update={"id": "2", "publisher": "Other edition"})]
    response = client.get("/books/search?q=dune")
    assert response.status_code == 200
    assert response.json()["source"] == "combined"
    assert len(response.json()["books"]) == 2
    library.assert_awaited_once_with("dune")


def test_search_survives_a_provider_failure(client: TestClient, catalogs):
    google, library, _, _, _ = catalogs
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

def test_plain_search_returns_series_before_ordinary_books(client: TestClient, catalogs):
    member = BOOK.model_copy(
        update={
            "id": "hardcover:17",
            "title": "The Eye of the World",
            "source": "hardcover",
            "series": SeriesMembership(id="5", name="The Wheel of Time", position=1),
        }
    )
    catalogs[4].return_value = [
        SeriesResult(id="5", name="The Wheel of Time", author="Robert Jordan", members=[member], incomplete=False)
    ]
    catalogs[0].return_value = [BOOK.model_copy(update={"title": "The Wheel of Time"})]
    response = client.get("/books/search?q=The%20Wheel%20of%20Time")
    assert response.status_code == 200
    assert response.json()["series"][0]["members"][0]["series"]["position"] == 1
    assert response.json()["books"][0]["title"] == "The Wheel of Time"
    catalogs[4].assert_awaited_once_with("The Wheel of Time")


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
    assert response.json()["books"] == []
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
