import httpx
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch

from hon.main import app

client = TestClient(app)


def make_ol_response(works: list[dict]) -> dict:
    return {"numFound": len(works), "docs": works}


def test_search_returns_books_with_page_count():
    mock_docs = [
        {
            "key": "/works/OL45804W",
            "title": "The Lord of the Rings",
            "author_name": ["J.R.R. Tolkien"],
            "number_of_pages_median": 1178,
            "cover_i": 8739161,
        }
    ]
    mock_response = MagicMock()
    mock_response.json.return_value = make_ol_response(mock_docs)
    mock_response.raise_for_status = MagicMock()

    with patch("hon.routers.books.httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_client

        response = client.get("/books/search?q=tolkien")

    assert response.status_code == 200
    books = response.json()
    assert len(books) == 1
    assert books[0]["id"] == "OL45804W"
    assert books[0]["title"] == "The Lord of the Rings"
    assert books[0]["author"] == "J.R.R. Tolkien"
    assert books[0]["page_count"] == 1178
    assert "covers.openlibrary.org" in books[0]["cover_url"]


def test_search_filters_books_without_page_count():
    mock_docs = [
        {
            "key": "/works/OL1W",
            "title": "No Pages Book",
            "author_name": ["Someone"],
            # number_of_pages_median intentionally missing
        }
    ]
    mock_response = MagicMock()
    mock_response.json.return_value = make_ol_response(mock_docs)
    mock_response.raise_for_status = MagicMock()

    with patch("hon.routers.books.httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_client

        response = client.get("/books/search?q=unknown")

    assert response.status_code == 200
    assert response.json() == []


def test_search_requires_query():
    response = client.get("/books/search")
    assert response.status_code == 422


def test_search_rejects_queries_shorter_than_three_characters():
    response = client.get("/books/search?q=lo")
    assert response.status_code == 422


def test_search_returns_gateway_timeout_when_upstream_times_out():
    with patch("hon.routers.books.httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(side_effect=httpx.ReadTimeout("timed out", request=None))
        mock_client_class.return_value = mock_client

        response = client.get("/books/search?q=lord")

    assert response.status_code == 504
    assert response.json() == {"detail": "Book search timed out"}


def test_search_handles_missing_cover():
    mock_docs = [
        {
            "key": "/works/OL2W",
            "title": "No Cover Book",
            "author_name": ["Author"],
            "number_of_pages_median": 200,
            # cover_i intentionally missing
        }
    ]
    mock_response = MagicMock()
    mock_response.json.return_value = make_ol_response(mock_docs)
    mock_response.raise_for_status = MagicMock()

    with patch("hon.routers.books.httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_client

        response = client.get("/books/search?q=test")

    assert response.status_code == 200
    books = response.json()
    assert books[0]["cover_url"] is None
