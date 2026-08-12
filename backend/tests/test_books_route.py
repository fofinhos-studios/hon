import asyncio
import logging
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient

from hon.models.book import BookResult

BOOK = BookResult(id="1", title="Dune", author="Frank Herbert", page_count=412, cover_url=None)


def test_health_reports_service_status(client: TestClient):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_search_returns_google_books_results(client: TestClient):
    with (
        patch("hon.routers.books.search_google_books", AsyncMock(return_value=[BOOK])),
        patch("hon.routers.books.search_open_library", AsyncMock()) as fallback,
    ):
        response = client.get("/books/search?q=dune")
    assert response.status_code == 200
    assert response.json()["source"] == "google_books"
    fallback.assert_not_awaited()


def test_search_falls_back_to_open_library(client: TestClient):
    with (
        patch("hon.routers.books.search_google_books", AsyncMock(side_effect=httpx.DecodingError("bad"))),
        patch("hon.routers.books.search_open_library", AsyncMock(return_value=[BOOK])),
    ):
        response = client.get("/books/search?q=dune")
    assert response.status_code == 200
    assert response.json()["source"] == "open_library"


def test_search_maps_open_library_timeout(client: TestClient):
    with (
        patch("hon.routers.books.search_google_books", AsyncMock(return_value=[])),
        patch("hon.routers.books.search_open_library", AsyncMock(side_effect=httpx.ReadTimeout("timeout"))),
    ):
        response = client.get("/books/search?q=dune")
    assert response.status_code == 504


def test_search_maps_open_library_failure(client: TestClient):
    with (
        patch("hon.routers.books.search_google_books", AsyncMock(return_value=[])),
        patch("hon.routers.books.search_open_library", AsyncMock(side_effect=httpx.ConnectError("failure"))),
    ):
        response = client.get("/books/search?q=dune")
    assert response.status_code == 502


def test_search_validates_query(client: TestClient):
    assert client.get("/books/search").status_code == 422
    assert client.get("/books/search?q=lo").status_code == 422
    assert client.get("/books/search?q=+++").status_code == 422
    assert client.get(f"/books/search?q={'a' * 201}").status_code == 422


def test_search_strips_query_before_calling_provider(client: TestClient):
    google = AsyncMock(return_value=[BOOK])
    with patch("hon.routers.books.search_google_books", google):
        response = client.get("/books/search", params={"q": "  dune  "})

    assert response.status_code == 200
    google.assert_awaited_once_with("dune")


def test_search_logs_google_failure_before_fallback(client: TestClient, caplog):
    with (
        caplog.at_level(logging.WARNING, logger="hon.routers.books"),
        patch("hon.routers.books.search_google_books", AsyncMock(side_effect=httpx.ConnectError("failure"))),
        patch("hon.routers.books.search_open_library", AsyncMock(return_value=[BOOK])),
    ):
        response = client.get("/books/search?q=dune")

    assert response.status_code == 200
    assert "Google Books search failed; falling back" in caplog.text


def test_search_enforces_total_deadline(client: TestClient):
    async def slow_search(_query: str):
        await asyncio.sleep(1)

    with (
        patch("hon.routers.books.SEARCH_DEADLINE_SECONDS", 0.01),
        patch("hon.routers.books.search_google_books", side_effect=slow_search),
    ):
        response = client.get("/books/search?q=dune")

    assert response.status_code == 504
