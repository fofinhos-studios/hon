import asyncio
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from hon.models.book import BookResult
from hon.routers.books import _cache

BOOK = BookResult(id="1", title="Dune", author="Frank Herbert", page_count=412, cover_url=None)


@pytest.fixture(autouse=True)
def catalogs():
    _cache.clear()
    with (
        patch("hon.routers.books.search_google_books", AsyncMock(return_value=[])) as google,
        patch("hon.routers.books.search_open_library", AsyncMock(return_value=[])) as library,
        patch("hon.routers.books.search_bookinfo", AsyncMock(return_value=[])) as bookinfo,
    ):
        yield google, library, bookinfo
    _cache.clear()


def test_health_reports_service_status(client: TestClient):
    assert client.get("/health").json() == {"status": "ok"}


def test_search_combines_catalogs_and_keeps_distinct_editions(client: TestClient, catalogs):
    google, library, bookinfo = catalogs
    google.return_value = [BOOK]
    bookinfo.return_value = [BOOK.model_copy(update={"id": "2", "publisher": "Other edition"})]
    response = client.get("/books/search?q=dune")
    assert response.status_code == 200
    assert response.json()["source"] == "combined"
    assert len(response.json()["books"]) == 2
    library.assert_awaited_once_with("dune")


def test_search_survives_a_provider_failure(client: TestClient, catalogs):
    google, library, _ = catalogs
    google.side_effect = httpx.DecodingError("bad")
    library.return_value = [BOOK]
    response = client.get("/books/search?q=dune")
    assert response.status_code == 200
    assert response.json()["source"] == "open_library"


@pytest.mark.parametrize(("error", "status"), [(httpx.ReadTimeout("timeout"), 504), (httpx.ConnectError("bad"), 502)])
def test_search_maps_outages(client: TestClient, catalogs, error, status):
    catalogs[1].side_effect = error
    assert client.get("/books/search?q=dune").status_code == status


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


def test_search_enforces_total_deadline(client: TestClient, catalogs):
    async def slow_search(*_args):
        await asyncio.sleep(1)

    catalogs[0].side_effect = slow_search
    with patch("hon.routers.books.SEARCH_DEADLINE_SECONDS", 0.01):
        assert client.get("/books/search?q=dune").status_code == 504
