import asyncio
import logging
from collections import OrderedDict
from time import monotonic

import httpx
from fastapi import APIRouter, HTTPException, Query

from hon.models.book import SearchResult
from hon.models.visuals import BookVisuals, VisualRequest
from hon.services.book_visuals import get_visuals
from hon.services.bookinfo import search as search_bookinfo
from hon.services.catalog import folded, rank_books
from hon.services.google_books import search as search_google_books
from hon.services.open_library import search as search_open_library

router = APIRouter(prefix="/books", tags=["books"])
logger = logging.getLogger(__name__)
MAX_QUERY_LENGTH = 200
SEARCH_DEADLINE_SECONDS = 12.0
_cache: OrderedDict[str, tuple[float, SearchResult]] = OrderedDict()


@router.post("/visuals", response_model=BookVisuals)
async def book_visuals(book: VisualRequest) -> BookVisuals:
    return await get_visuals(book)


@router.get("/search", response_model=SearchResult)
async def search_books(
    q: str = Query(..., min_length=3, max_length=MAX_QUERY_LENGTH),
) -> SearchResult:
    query = q.strip()
    if len(query) < 3 or not folded(query):
        raise HTTPException(status_code=422, detail="Search query must contain at least 3 characters")
    key = folded(query)
    cached = _cache.get(key)
    if cached and cached[0] > monotonic():
        _cache.move_to_end(key)
        return cached[1]
    try:
        async with asyncio.timeout(SEARCH_DEADLINE_SECONDS):
            result = await _search_catalogs(query)
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Book search timed out") from exc
    _cache[key] = (monotonic() + (300 if result.books and not result.partial else 15), result)
    _cache.move_to_end(key)
    while len(_cache) > 128:
        _cache.popitem(last=False)
    return result


async def _search_catalogs(query: str) -> SearchResult:
    # Query editions across catalogs; an available result survives another provider's failure.
    providers = [
        ("bookinfo", search_bookinfo),
        ("google_books", search_google_books),
        ("open_library", search_open_library),
    ]

    async def run(search):
        async with asyncio.timeout(10):
            return await search(query)

    results = await asyncio.gather(*(run(search) for _, search in providers), return_exceptions=True)
    books = []
    sources = []
    errors = []
    for (name, _), result in zip(providers, results, strict=True):
        if isinstance(result, BaseException):
            if not isinstance(result, (httpx.HTTPError, TimeoutError)):
                raise result
            logger.warning("%s search unavailable (%s)", name, type(result).__name__)
            errors.append(result)
        elif result:
            books.extend(result)
            sources.append(name)
    ranked = rank_books(query, books)
    if not books and errors:
        status = 504 if any(isinstance(error, (httpx.TimeoutException, TimeoutError)) for error in errors) else 502
        raise HTTPException(status_code=status, detail="Book search unavailable. Try again.")
    source = sources[0] if len(sources) == 1 else "combined"
    return SearchResult(books=ranked, source=source, partial=bool(errors))
