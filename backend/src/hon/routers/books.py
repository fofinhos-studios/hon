import asyncio
import logging
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from time import monotonic

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse

from hon.models.book import AudiobookResult, BookResult, SearchResult, SeriesResult
from hon.models.visuals import BookVisuals, VisualRequest
from hon.services.audiosilo import search as search_audiosilo
from hon.services.book_visuals import get_visuals
from hon.services.bookinfo import search as search_bookinfo
from hon.services.catalog import folded, isbn_value, rank_books, usable, work_key
from hon.services.google_books import search as search_google_books
from hon.services.hardcover import SeriesProviderError, enrich_catalog_books, search_series
from hon.services.open_library import search as search_open_library
from hon.services.publisher_cover import get_book_cover

router = APIRouter(prefix="/books", tags=["books"])
logger = logging.getLogger(__name__)
MAX_QUERY_LENGTH = 200
SEARCH_DEADLINE_SECONDS = 12.0
CATALOG_TIMEOUT_SECONDS = 6.0
SERIES_TIMEOUT_SECONDS = 8.0
ENRICHMENT_TIMEOUT_SECONDS = 2.0
_cache: OrderedDict[tuple[str, str | None], tuple[float, SearchResult]] = OrderedDict()


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
    edition_type: str | None = Query(default=None, pattern="^(physical|digital|unspecified|audiobook)$"),
) -> SearchResult:
    query = q.strip()
    if len(query) < 3 or not folded(query):
        raise HTTPException(status_code=422, detail="Search query must contain at least 3 characters")
    key = folded(query), edition_type
    cached = _cache.get(key)
    if cached and cached[0] > monotonic():
        _cache.move_to_end(key)
        return cached[1]
    try:
        async with asyncio.timeout(SEARCH_DEADLINE_SECONDS):
            result = await _search_catalogs(query, edition_type)
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Book search timed out") from exc
    _cache[key] = (monotonic() + (300 if (result.books or result.series) and not result.partial else 15), result)
    _cache.move_to_end(key)
    while len(_cache) > 128:
        _cache.popitem(last=False)
    return result


async def _search_catalogs(query: str, edition_type: str | None = None) -> SearchResult:
    started = monotonic()
    providers: list[
        tuple[str, Callable[[str], Awaitable[list[BookResult] | list[AudiobookResult]]]]
    ] = []
    if edition_type != "audiobook":
        if edition_type in (None, "unspecified"):
            providers.append(("bookinfo", search_bookinfo))
        providers.extend((("google_books", search_google_books), ("open_library", search_open_library)))
    if edition_type in (None, "audiobook"):
        providers.append(("audiosilo", search_audiosilo))
    series_providers: list[tuple[str, Callable[[str], Awaitable[list[SeriesResult]]]]] = (
        [] if edition_type == "audiobook" else [("hardcover", search_series)]
    )

    async def run[T](search: Callable[[str], Awaitable[T]], timeout: float) -> T:
        async with asyncio.timeout(timeout):
            return await search(query)

    book_results, series_results = await asyncio.gather(
        asyncio.gather(*(run(search, CATALOG_TIMEOUT_SECONDS) for _, search in providers), return_exceptions=True),
        asyncio.gather(
            *(run(search, SERIES_TIMEOUT_SECONDS) for _, search in series_providers),
            return_exceptions=True,
        ),
    )
    books: list[BookResult | AudiobookResult] = []
    series: list[SeriesResult] = []
    sources = []
    errors = []
    successes = 0
    for (name, _), result in zip(providers, book_results, strict=True):
        if isinstance(result, BaseException):
            if not isinstance(result, (httpx.HTTPError, TimeoutError, SeriesProviderError)):
                raise result
            logger.warning("%s search unavailable (%s)", name, type(result).__name__)
            errors.append(result)
        else:
            successes += 1
            if result:
                books.extend(result)
                sources.append(name)
    for (name, _), result in zip(series_providers, series_results, strict=True):
        if isinstance(result, BaseException):
            if not isinstance(result, (httpx.HTTPError, TimeoutError, SeriesProviderError)):
                raise result
            logger.warning("%s search unavailable (%s)", name, type(result).__name__)
            errors.append(result)
        else:
            successes += 1
            if result:
                series.extend(result)
    ranked: list[BookResult | AudiobookResult] = rank_books(query, books, limit=None)
    query_title = folded(query)
    if any(folded(book.title) == query_title for book in ranked):
        name_key = _series_title_key(query)
        series = [item for item in series if _series_title_key(item.name) == name_key]
    if edition_type in ("physical", "digital", "unspecified"):
        filtered_series = []
        for item in series:
            matching_members = [member for member in item.members if member.format == edition_type]
            if matching_members:
                filtered_series.append(item.model_copy(update={
                    "members": matching_members,
                    "incomplete": item.incomplete or len(matching_members) != len(item.members),
                }))
        series = filtered_series
    if series:
        sources.append("hardcover")
    candidates = [
        book for book in ranked
        if isinstance(book, BookResult) and book.source != "hardcover" and not book.series
    ][:12]
    if candidates:
        try:
            remaining = max(0, SEARCH_DEADLINE_SECONDS - (monotonic() - started) - 0.5)
            async with asyncio.timeout(min(ENRICHMENT_TIMEOUT_SECONDS, remaining)):
                enriched = await enrich_catalog_books(query, candidates)
            updates = {id(book): updated for book, updated in zip(candidates, enriched, strict=True)}
            ranked = [updates.get(id(book), book) for book in ranked]
        except (httpx.HTTPError, TimeoutError, SeriesProviderError) as exc:
            logger.warning("Hardcover membership unavailable (%s)", type(exc).__name__)
            errors.append(exc)
    members = [member for item in series for member in item.members if usable(member)]
    if members:
        for member in members:
            if member.isbn:
                continue
            matches = [
                (index, book) for index, book in enumerate(ranked)
                if isinstance(book, BookResult)
                and folded(book.title) == folded(member.title)
                and folded(book.author) == folded(member.author)
                and (not member.language or not book.language or member.language == book.language)
                and (book.page_count is None or member.page_count is None or book.page_count == member.page_count)
                and (book.format == "unspecified" or member.format == "unspecified" or book.format == member.format)
                and (
                    not book.published_date or not member.published_date
                    or folded(book.published_date) == folded(member.published_date)
                )
                and (not book.publisher or not member.publisher or folded(book.publisher) == folded(member.publisher))
                and (
                    not book.series or not member.series
                    or (book.series.id == member.series.id and (
                        book.series.position is None or member.series.position is None
                        or book.series.position == member.series.position
                    ))
                )
            ]
            if len(matches) == 1:
                index, match = matches[0]
                ranked[index] = match.model_copy(update={"series": match.series or member.series})
            else:
                ranked.append(member)
        ranked = rank_books(
            query, ranked + [member for member in members if member.isbn], include_unrelated=True, limit=None
        )
    ranked = [book.model_copy(update={"work_key": work_key(book)}) for book in ranked]
    if edition_type == "audiobook":
        ranked = [book for book in ranked if isinstance(book, AudiobookResult)]
        series = []
    elif edition_type is not None:
        ranked = [book for book in ranked if isinstance(book, BookResult) and book.format == edition_type]
    if not successes:
        status = 504 if any(isinstance(error, (httpx.TimeoutException, TimeoutError)) for error in errors) else 502
        raise HTTPException(status_code=status, detail="Book search unavailable. Try again.")
    source = sources[0] if len(sources) == 1 else "combined"
    return SearchResult(books=ranked, series=series, source=source, partial=bool(errors))
