import inspect

import httpx
from fastapi import APIRouter, Query

from hon.models.book import BookResult

router = APIRouter(prefix="/books", tags=["books"])

OPENLIBRARY_SEARCH_URL = "https://openlibrary.org/search.json"
OPENLIBRARY_COVER_URL = "https://covers.openlibrary.org/b/id/{cover_id}-M.jpg"
SEARCH_FIELDS = "key,title,author_name,number_of_pages_median,cover_i"
SEARCH_LIMIT = 10


def _parse_work_id(key: str) -> str:
    return key.removeprefix("/works/")


def _normalize(doc: dict) -> BookResult | None:
    page_count = doc.get("number_of_pages_median")
    if not page_count:
        return None

    cover_id = doc.get("cover_i")
    cover_url = OPENLIBRARY_COVER_URL.format(cover_id=cover_id) if cover_id else None

    authors = doc.get("author_name") or []
    author = authors[0] if authors else "Unknown"

    return BookResult(
        id=_parse_work_id(doc["key"]),
        title=doc["title"],
        author=author,
        page_count=int(page_count),
        cover_url=cover_url,
    )


async def _resolve(value):
    if inspect.isawaitable(value):
        return await value
    return value


@router.get("/search", response_model=list[BookResult])
async def search_books(q: str = Query(..., min_length=1)) -> list[BookResult]:
    params = {
        "q": q,
        "fields": SEARCH_FIELDS,
        "limit": SEARCH_LIMIT,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(OPENLIBRARY_SEARCH_URL, params=params)
        await _resolve(response.raise_for_status())
        data = await _resolve(response.json())

    results = []
    for doc in data.get("docs", []):
        book = _normalize(doc)
        if book is not None:
            results.append(book)

    return results
