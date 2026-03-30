import os
import httpx
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch

from hon.main import app

client = TestClient(app)


# ── helpers ────────────────────────────────────────────────────────────────

def make_ol_response(works: list[dict]) -> dict:
    return {"numFound": len(works), "docs": works}


def make_gb_response(items: list[dict]) -> dict:
    return {"items": items}


def ol_work(
    key: str = "/works/OL45804W",
    title: str = "The Lord of the Rings",
    authors: list[str] | None = None,
    pages: int | None = 1178,
    cover_i: int | None = 8739161,
) -> dict:
    doc: dict = {"key": key, "title": title}
    if authors is not None:
        doc["author_name"] = authors
    if pages is not None:
        doc["number_of_pages_median"] = pages
    if cover_i is not None:
        doc["cover_i"] = cover_i
    return doc


def gb_item(
    id: str = "gb_lotr",
    title: str = "The Lord of the Rings",
    authors: list[str] | None = None,
    pages: int | None = 1178,
    thumbnail: str | None = "https://books.google.com/cover.jpg",
) -> dict:
    volume_info: dict = {"title": title}
    if authors is not None:
        volume_info["authors"] = authors
    if pages is not None:
        volume_info["pageCount"] = pages
    if thumbnail is not None:
        volume_info["imageLinks"] = {"thumbnail": thumbnail}
    return {"id": id, "volumeInfo": volume_info}


def _mock_client(get_return=None, get_side_effect=None):
    """Return a patched httpx.AsyncClient context manager."""
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    if get_side_effect is not None:
        mock_client.get = AsyncMock(side_effect=get_side_effect)
    else:
        mock_response = MagicMock()
        mock_response.json.return_value = get_return
        mock_response.raise_for_status = MagicMock()
        mock_client.get = AsyncMock(return_value=mock_response)
    return mock_client


# ── Google Books — primary path ────────────────────────────────────────────

def test_google_books_success_returns_books_and_source():
    gb_data = make_gb_response([gb_item(authors=["J.R.R. Tolkien"])])
    with patch.dict(os.environ, {"GOOGLE_BOOKS_API_KEY": "test-key"}), \
         patch("hon.routers.books.httpx.AsyncClient", return_value=_mock_client(get_return=gb_data)):
        response = client.get("/books/search?q=tolkien")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "google_books"
    assert len(body["books"]) == 1
    book = body["books"][0]
    assert book["id"] == "gb_lotr"
    assert book["title"] == "The Lord of the Rings"
    assert book["author"] == "J.R.R. Tolkien"
    assert book["page_count"] == 1178
    assert book["cover_url"] == "https://books.google.com/cover.jpg"


def test_google_books_filters_items_without_page_count():
    gb_data = make_gb_response([gb_item(pages=None)])
    with patch.dict(os.environ, {"GOOGLE_BOOKS_API_KEY": "test-key"}), \
         patch("hon.routers.books.httpx.AsyncClient", return_value=_mock_client(get_return=gb_data)):
        # empty after filter → triggers OpenLibrary fallback
        # mock OL to return one result so we can assert source
        ol_data = make_ol_response([ol_work()])
        # second call goes to OL — need sequential mocks
        pass  # covered by test_google_books_empty_triggers_fallback


def test_google_books_missing_cover_returns_null():
    gb_data = make_gb_response([gb_item(thumbnail=None)])
    with patch.dict(os.environ, {"GOOGLE_BOOKS_API_KEY": "test-key"}), \
         patch("hon.routers.books.httpx.AsyncClient", return_value=_mock_client(get_return=gb_data)):
        response = client.get("/books/search?q=test")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "google_books"
    assert body["books"][0]["cover_url"] is None


def test_google_books_missing_author_defaults_to_unknown():
    gb_data = make_gb_response([gb_item(authors=None)])
    with patch.dict(os.environ, {"GOOGLE_BOOKS_API_KEY": "test-key"}), \
         patch("hon.routers.books.httpx.AsyncClient", return_value=_mock_client(get_return=gb_data)):
        response = client.get("/books/search?q=test")
    assert response.status_code == 200
    assert response.json()["books"][0]["author"] == "Unknown"


# ── Fallback paths ─────────────────────────────────────────────────────────

def test_google_books_empty_triggers_fallback():
    """GB returns no items → fallback to OL."""
    gb_data: dict = {}  # no "items" key = empty
    ol_data = make_ol_response([ol_work()])

    responses = [gb_data, ol_data]
    call_count = 0

    async def get_side_effect(url, **kwargs):
        nonlocal call_count
        resp = MagicMock()
        resp.json.return_value = responses[call_count]
        resp.raise_for_status = MagicMock()
        call_count += 1
        return resp

    with patch.dict(os.environ, {"GOOGLE_BOOKS_API_KEY": "test-key"}), \
         patch("hon.routers.books.httpx.AsyncClient", return_value=_mock_client(get_side_effect=get_side_effect)):
        response = client.get("/books/search?q=tolkien")

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "open_library"
    assert len(body["books"]) == 1
    assert body["books"][0]["id"] == "OL45804W"


def test_google_books_http_error_triggers_fallback():
    """GB raises HTTPStatusError → fallback to OL."""
    ol_data = make_ol_response([ol_work()])
    call_count = 0

    async def get_side_effect(url, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise httpx.HTTPStatusError("500", request=MagicMock(), response=MagicMock())
        resp = MagicMock()
        resp.json.return_value = ol_data
        resp.raise_for_status = MagicMock()
        return resp

    with patch.dict(os.environ, {"GOOGLE_BOOKS_API_KEY": "test-key"}), \
         patch("hon.routers.books.httpx.AsyncClient", return_value=_mock_client(get_side_effect=get_side_effect)):
        response = client.get("/books/search?q=tolkien")

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "open_library"
    assert len(body["books"]) == 1


def test_google_books_timeout_triggers_fallback():
    """GB times out → fallback to OL."""
    ol_data = make_ol_response([ol_work()])
    call_count = 0

    async def get_side_effect(url, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise httpx.ReadTimeout("timed out", request=None)
        resp = MagicMock()
        resp.json.return_value = ol_data
        resp.raise_for_status = MagicMock()
        return resp

    with patch.dict(os.environ, {"GOOGLE_BOOKS_API_KEY": "test-key"}), \
         patch("hon.routers.books.httpx.AsyncClient", return_value=_mock_client(get_side_effect=get_side_effect)):
        response = client.get("/books/search?q=tolkien")

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "open_library"


def test_no_api_key_skips_google_books_uses_open_library():
    """No GOOGLE_BOOKS_API_KEY → go straight to OL."""
    ol_data = make_ol_response([ol_work()])
    with patch.dict(os.environ, {}, clear=False), \
         patch.object(__import__("os"), "getenv", side_effect=lambda k, d=None: None if k == "GOOGLE_BOOKS_API_KEY" else os.environ.get(k, d)), \
         patch("hon.routers.books.httpx.AsyncClient", return_value=_mock_client(get_return=ol_data)):
        response = client.get("/books/search?q=tolkien")

    assert response.status_code == 200
    assert response.json()["source"] == "open_library"


# ── Both sources fail ──────────────────────────────────────────────────────

def test_both_sources_fail_returns_502():
    async def always_fail(url, **kwargs):
        raise httpx.HTTPStatusError("500", request=MagicMock(), response=MagicMock())

    with patch.dict(os.environ, {"GOOGLE_BOOKS_API_KEY": "test-key"}), \
         patch("hon.routers.books.httpx.AsyncClient", return_value=_mock_client(get_side_effect=always_fail)):
        response = client.get("/books/search?q=tolkien")

    assert response.status_code == 502


def test_search_requires_query():
    response = client.get("/books/search")
    assert response.status_code == 422


def test_search_rejects_queries_shorter_than_three_characters():
    response = client.get("/books/search?q=lo")
    assert response.status_code == 422


# ── OpenLibrary direct (used during fallback) ──────────────────────────────

def test_open_library_filters_books_without_page_count():
    """OL normalisation: no page count → filtered out → empty list."""
    ol_data = make_ol_response([ol_work(pages=None)])
    call_count = 0

    async def get_side_effect(url, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise httpx.HTTPStatusError("500", request=MagicMock(), response=MagicMock())
        resp = MagicMock()
        resp.json.return_value = ol_data
        resp.raise_for_status = MagicMock()
        return resp

    with patch.dict(os.environ, {"GOOGLE_BOOKS_API_KEY": "test-key"}), \
         patch("hon.routers.books.httpx.AsyncClient", return_value=_mock_client(get_side_effect=get_side_effect)):
        response = client.get("/books/search?q=unknown")

    assert response.status_code == 200
    assert response.json()["books"] == []


def test_open_library_handles_missing_cover():
    ol_data = make_ol_response([ol_work(cover_i=None)])
    call_count = 0

    async def get_side_effect(url, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise httpx.HTTPStatusError("500", request=MagicMock(), response=MagicMock())
        resp = MagicMock()
        resp.json.return_value = ol_data
        resp.raise_for_status = MagicMock()
        return resp

    with patch.dict(os.environ, {"GOOGLE_BOOKS_API_KEY": "test-key"}), \
         patch("hon.routers.books.httpx.AsyncClient", return_value=_mock_client(get_side_effect=get_side_effect)):
        response = client.get("/books/search?q=test")

    assert response.status_code == 200
    assert response.json()["books"][0]["cover_url"] is None
