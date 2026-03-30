import os

import httpx
from fastapi import APIRouter, HTTPException, Query

from hon.models.book import BookResult, SearchResult

router = APIRouter(prefix="/books", tags=["books"])

GOOGLE_BOOKS_URL = "https://www.googleapis.com/books/v1/volumes"
OPENLIBRARY_SEARCH_URL = "https://openlibrary.org/search.json"
OPENLIBRARY_COVER_URL = "https://covers.openlibrary.org/b/id/{cover_id}-M.jpg"
SEARCH_LIMIT = 10
SEARCH_TIMEOUT_SECONDS = 15.0


# ── Google Books ────────────────────────────────────────────────────────────

def _normalize_google_cover_url(url: str | None) -> str | None:
    if not url:
        return None
    return url.replace("http://", "https://", 1)


def _google_books_queries(q: str) -> list[str]:
    return [f"intitle:{q}", f"inauthor:{q}", q]


def _normalize_gb(item: dict) -> BookResult | None:
    info = item.get("volumeInfo", {})
    page_count = info.get("pageCount")
    if not page_count or page_count < 1:
        return None
    authors = info.get("authors") or []
    cover_url: str | None = None
    image_links = info.get("imageLinks") or {}
    if "thumbnail" in image_links:
        cover_url = _normalize_google_cover_url(image_links["thumbnail"])
    return BookResult(
        id=item["id"],
        title=info.get("title", "Unknown"),
        author=authors[0] if authors else "Unknown",
        page_count=int(page_count),
        cover_url=cover_url,
    )


async def _fetch_google_books(client: httpx.AsyncClient, q: str, api_key: str) -> list[BookResult]:
    params = {
        "q": q,
        "maxResults": SEARCH_LIMIT,
        "printType": "books",
        "key": api_key,
    }
    response = await client.get(GOOGLE_BOOKS_URL, params=params)
    response.raise_for_status()
    data = response.json()
    results = []
    for item in data.get("items") or []:
        book = _normalize_gb(item)
        if book is not None:
            results.append(book)
    return results


async def _search_google_books(q: str) -> list[BookResult]:
    api_key = os.getenv("GOOGLE_BOOKS_API_KEY")
    if not api_key:
        return []

    results: list[BookResult] = []
    seen_ids: set[str] = set()
    async with httpx.AsyncClient(timeout=SEARCH_TIMEOUT_SECONDS) as client:
        for query in _google_books_queries(q):
            books = await _fetch_google_books(client, query, api_key)
            for book in books:
                if book.id in seen_ids:
                    continue
                seen_ids.add(book.id)
                results.append(book)
                if len(results) == SEARCH_LIMIT:
                    return results
    return results


# ── OpenLibrary ─────────────────────────────────────────────────────────────

def _normalize_ol(doc: dict) -> BookResult | None:
    page_count = doc.get("number_of_pages_median")
    if not page_count or page_count < 1:
        return None
    cover_id = doc.get("cover_i")
    cover_url = OPENLIBRARY_COVER_URL.format(cover_id=cover_id) if cover_id else None
    authors = doc.get("author_name") or []
    return BookResult(
        id=doc["key"].removeprefix("/works/"),
        title=doc["title"],
        author=authors[0] if authors else "Unknown",
        page_count=int(page_count),
        cover_url=cover_url,
    )


async def _search_open_library(q: str) -> list[BookResult]:
    params = {
        "q": q,
        "fields": "key,title,author_name,number_of_pages_median,cover_i",
        "limit": SEARCH_LIMIT,
    }
    async with httpx.AsyncClient(timeout=SEARCH_TIMEOUT_SECONDS) as client:
        response = await client.get(OPENLIBRARY_SEARCH_URL, params=params)
        response.raise_for_status()
        data = response.json()
    results = []
    for doc in data.get("docs", []):
        book = _normalize_ol(doc)
        if book is not None:
            results.append(book)
    return results


# ── Route ───────────────────────────────────────────────────────────────────

@router.get("/search", response_model=SearchResult)
async def search_books(q: str = Query(..., min_length=3)) -> SearchResult:
    # 1. Try Google Books
    try:
        books = await _search_google_books(q)
        if books:
            return SearchResult(books=books, source="google_books")
    except httpx.HTTPError:
        pass  # fall through to OpenLibrary

    # 2. Fallback: OpenLibrary
    try:
        books = await _search_open_library(q)
        return SearchResult(books=books, source="open_library")
    except httpx.ReadTimeout as exc:
        raise HTTPException(status_code=504, detail="Book search timed out") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Book search unavailable") from exc
