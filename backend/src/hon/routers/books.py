import asyncio
import logging
from collections import OrderedDict
from time import monotonic

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse

from hon.models.book import BookResult, SearchResult
from hon.models.visuals import BookVisuals, VisualRequest
from hon.services.audiosilo import search as search_audiosilo
from hon.services.book_visuals import get_visuals
from hon.services.bookinfo import search as search_bookinfo
from hon.services.catalog import folded, isbn_value, rank_books, work_key
from hon.services.google_books import search as search_google_books
from hon.services.hardcover import SeriesProviderError, enrich_catalog_books, search_series
from hon.services.open_library import search as search_open_library
from hon.services.publisher_cover import get_book_cover

router = APIRouter(prefix="/books", tags=["books"])
logger = logging.getLogger(__name__)
MAX_QUERY_LENGTH = 200
SEARCH_DEADLINE_SECONDS = 12.0
_cache: OrderedDict[str, tuple[float, SearchResult]] = OrderedDict()


def _series_title_key(value: str) -> str:
    title = folded(value)
    first, separator, rest = title.partition(" ")
    return rest if separator and first in {"a", "an", "the", "o", "os", "as", "um", "uma", "uns", "umas"} else title


@router.post("/visuals", response_model=BookVisuals)
async def book_visuals(book: VisualRequest) -> BookVisuals:
    return await get_visuals(book)


@router.get("/cover")
async def book_cover(
    isbn: str | None = Query(None, min_length=10, max_length=20),
    title: str | None = Query(None, min_length=1, max_length=MAX_QUERY_LENGTH),
    author: str | None = Query(None, min_length=1, max_length=MAX_QUERY_LENGTH),
):
    code = isbn_value(isbn) if isbn is not None else None
    if isbn is not None and not code:
        raise HTTPException(status_code=422, detail="Invalid ISBN")
    if (title is None) != (author is None):
        raise HTTPException(status_code=422, detail="Invalid title or author")
    if title is not None and author is not None and (not folded(title) or not folded(author)):
        raise HTTPException(status_code=422, detail="Invalid title or author")
    if not code and title is None:
        raise HTTPException(status_code=422, detail="ISBN or title and author required")
    url = await get_book_cover(code, title, author)
    if not url:
        raise HTTPException(status_code=404, detail="Cover unavailable", headers={"Cache-Control": "no-store"})
    return RedirectResponse(url, headers={"Cache-Control": "public, max-age=3600"})


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
    _cache[key] = (monotonic() + (300 if (result.books or result.series) and not result.partial else 15), result)
    _cache.move_to_end(key)
    while len(_cache) > 128:
        _cache.popitem(last=False)
    return result


async def _search_catalogs(query: str) -> SearchResult:
    started = monotonic()
    # Query editions across catalogs; an available result survives another provider's failure.
    providers = [
        ("bookinfo", search_bookinfo),
        ("google_books", search_google_books),
        ("open_library", search_open_library),
        ("audiosilo", search_audiosilo),
    ]
    series_provider = ("hardcover", search_series)

    async def run(search):
        async with asyncio.timeout(10):
            return await search(query)

    results = await asyncio.gather(
        *(run(search) for _, search in (*providers, series_provider)), return_exceptions=True
    )
    books = []
    series = []
    sources = []
    errors = []
    successes = 0
    for (name, _), result in zip((*providers, series_provider), results, strict=True):
        if isinstance(result, BaseException):
            if not isinstance(result, (httpx.HTTPError, TimeoutError, SeriesProviderError)):
                raise result
            logger.warning("%s search unavailable (%s)", name, type(result).__name__)
            errors.append(result)
        else:
            successes += 1
            if result:
                if name == "hardcover":
                    series.extend(result)
                else:
                    books.extend(result)
                    sources.append(name)
    ranked = [book.model_copy(update={"work_key": work_key(book)}) for book in rank_books(query, books)]
    query_title = folded(query)
    if any(folded(book.title) == query_title for book in ranked):
        name_key = _series_title_key(query)
        series = [item for item in series if _series_title_key(item.name) == name_key]
    if series:
        sources.append("hardcover")
    if any(isinstance(book, BookResult) for book in ranked):
        try:
            remaining = max(0, SEARCH_DEADLINE_SECONDS - (monotonic() - started) - 0.5)
            async with asyncio.timeout(min(10, remaining)):
                pages = await enrich_catalog_books(query, [book for book in ranked if isinstance(book, BookResult)])
            page_iter = iter(pages)
            ranked = [next(page_iter) if isinstance(book, BookResult) else book for book in ranked]
        except (httpx.HTTPError, TimeoutError, SeriesProviderError) as exc:
            logger.warning("Hardcover membership unavailable (%s)", type(exc).__name__)
            errors.append(exc)
    if not successes:
        status = 504 if any(isinstance(error, (httpx.TimeoutException, TimeoutError)) for error in errors) else 502
        raise HTTPException(status_code=status, detail="Book search unavailable. Try again.")
    source = sources[0] if len(sources) == 1 else "combined"
    return SearchResult(books=ranked, series=series, source=source, partial=bool(errors))
