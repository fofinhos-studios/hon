import asyncio
import logging

import httpx
from fastapi import APIRouter, HTTPException, Query

from hon.models.book import SearchResult
from hon.services.google_books import search as search_google_books
from hon.services.open_library import search as search_open_library

router = APIRouter(prefix="/books", tags=["books"])
logger = logging.getLogger(__name__)
MAX_QUERY_LENGTH = 200
SEARCH_DEADLINE_SECONDS = 20.0


@router.get("/search", response_model=SearchResult)
async def search_books(q: str = Query(..., min_length=3, max_length=MAX_QUERY_LENGTH)) -> SearchResult:
    query = q.strip()
    if len(query) < 3:
        raise HTTPException(status_code=422, detail="Search query must contain at least 3 characters")

    try:
        async with asyncio.timeout(SEARCH_DEADLINE_SECONDS):
            return await _search_catalogs(query)
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Book search timed out") from exc


async def _search_catalogs(query: str) -> SearchResult:
    try:
        books = await search_google_books(query)
        if books:
            return SearchResult(books=books, source="google_books")
    except httpx.HTTPError:
        logger.warning("Google Books search failed; falling back", exc_info=True)

    try:
        books = await search_open_library(query)
        return SearchResult(books=books, source="open_library")
    except httpx.ReadTimeout as exc:
        raise HTTPException(status_code=504, detail="Book search timed out") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Book search unavailable") from exc
