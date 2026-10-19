import asyncio
import logging
from collections import OrderedDict
from collections.abc import AsyncGenerator, AsyncIterator, Awaitable, Callable
from contextlib import aclosing
from time import monotonic

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse, StreamingResponse
from starlette.requests import ClientDisconnect
from starlette.types import Receive, Scope, Send

from hon.models.book import AudiobookResult, BookResult, SearchResult
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
series_router = APIRouter(prefix="/series", tags=["series"])
logger = logging.getLogger(__name__)
MAX_QUERY_LENGTH = 200
SEARCH_DEADLINE_SECONDS = 12.0
CATALOG_TIMEOUT_SECONDS = 6.0
SERIES_TIMEOUT_SECONDS = 8.0
ENRICHMENT_TIMEOUT_SECONDS = 2.0
_cache: OrderedDict[tuple[str, str, str | None], tuple[float, SearchResult]] = OrderedDict()


class _SearchStream(StreamingResponse):
    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        streaming = asyncio.create_task(self.stream_response(send))
        disconnected = asyncio.create_task(self.listen_for_disconnect(receive))
        try:
            done, _ = await asyncio.wait({streaming, disconnected}, return_when=asyncio.FIRST_COMPLETED)
            if streaming in done:
                try:
                    await streaming
                except OSError as exc:
                    raise ClientDisconnect() from exc
            else:
                await disconnected
        finally:
            streaming.cancel()
            disconnected.cancel()
            await asyncio.gather(streaming, disconnected, return_exceptions=True)
            if isinstance(self.body_iterator, AsyncGenerator):
                await self.body_iterator.aclose()


def _series_title_key(value: str) -> str:
    title = folded(value)
    first, separator, rest = title.partition(" ")
    return rest if separator and first in {"a", "an", "the", "o", "os", "as", "um", "uma", "uns", "umas"} else title


def _validated_query(value: str) -> tuple[str, str]:
    query = value.strip()
    normalized = folded(query)
    if len(query) < 3 or not normalized:
        raise HTTPException(status_code=422, detail="Search query must contain at least 3 characters")
    return query, normalized


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
    request: Request,
    q: str = Query(..., min_length=3, max_length=MAX_QUERY_LENGTH),
    edition_type: str | None = Query(default=None, pattern="^(physical|digital|unspecified|audiobook)$"),
) -> SearchResult | StreamingResponse:
    query, normalized = _validated_query(q)
    key = ("books", normalized, edition_type)
    cached = _cached_book_result(normalized, edition_type)
    streaming = any(
        media_type.split(";", 1)[0].strip().lower() == "application/x-ndjson"
        for media_type in request.headers.get("accept", "").split(",")
    )
    if streaming:
        async def stream() -> AsyncIterator[str]:
            if cached is not None:
                yield _search_event("final", cached)
                return
            try:
                async with aclosing(_search_catalog_events(query, edition_type)) as events:
                    async for kind, result in events:
                        if kind == "final":
                            _cache_result(key, result)
                        yield _search_event(kind, result)
            except TimeoutError:
                yield '{"type":"error","code":"timeout","message":"Book search timed out"}\n'
            except HTTPException as exc:
                code = "timeout" if exc.status_code == 504 else "unavailable"
                yield f'{{"type":"error","code":"{code}","message":"Book search unavailable. Try again."}}\n'

        return _SearchStream(stream(), media_type="application/x-ndjson")
    if cached is not None:
        return cached
    try:
        async for kind, result in _search_catalog_events(query, edition_type, preview=False):
            if kind == "final":
                _cache_result(key, result)
                return result
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Book search timed out") from exc
    raise RuntimeError("Book search ended without a result")


def _cached_book_result(normalized: str, edition_type: str | None) -> SearchResult | None:
    key = ("books", normalized, edition_type)
    now = monotonic()
    if edition_type is not None:
        complete_key = ("books", normalized, None)
        complete = _cache.get(complete_key)
        if complete and complete[0] > now and not complete[1].partial:
            _cache.move_to_end(complete_key)
            if edition_type == "audiobook":
                books = [book for book in complete[1].books if isinstance(book, AudiobookResult)]
            else:
                books = [
                    book for book in complete[1].books
                    if isinstance(book, BookResult) and book.format == edition_type
                ]
            source = (
                "open_library" if books and all(book.source == "open_library" for book in books)
                else complete[1].source
            )
            return complete[1].model_copy(update={"books": books, "source": source})
    cached = _cache.get(key)
    if cached and cached[0] > now:
        _cache.move_to_end(key)
        return cached[1]
    return None


def _search_event(kind: str, result: SearchResult) -> str:
    return '{"type":"' + kind + '","result":' + result.model_dump_json() + '}\n'


@series_router.get("/search", response_model=SearchResult)
async def search_hardcover_series(
    q: str = Query(..., min_length=3, max_length=MAX_QUERY_LENGTH),
) -> SearchResult:
    query, normalized = _validated_query(q)
    key = ("series", normalized, None)
    cached = _cache.get(key)
    if cached and cached[0] > monotonic():
        _cache.move_to_end(key)
        return cached[1]
    try:
        async with asyncio.timeout(SEARCH_DEADLINE_SECONDS):
            async with asyncio.timeout(SERIES_TIMEOUT_SECONDS):
                series = await search_series(query)
    except (httpx.TimeoutException, TimeoutError) as exc:
        raise HTTPException(status_code=504, detail="Series search timed out") from exc
    except (httpx.HTTPError, SeriesProviderError) as exc:
        logger.warning("Hardcover series search unavailable (%s)", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Series search unavailable. Try again.") from exc
    name_key = _series_title_key(query)
    matches = [item for item in series if f" {name_key} " in f" {_series_title_key(item.name)} "]
    matches.sort(key=lambda item: (
        _series_title_key(item.name) != name_key,
        not _series_title_key(item.name).startswith(f"{name_key} "),
    ))
    result = SearchResult(books=[], series=matches, source="hardcover", partial=False)
    _cache_result(key, result)
    return result


def _cache_result(key: tuple[str, str, str | None], result: SearchResult) -> None:
    _cache[key] = (monotonic() + (300 if (result.books or result.series) and not result.partial else 15), result)
    _cache.move_to_end(key)
    while len(_cache) > 128:
        _cache.popitem(last=False)


def _ranked_catalog_books(
    query: str, books: list[BookResult | AudiobookResult], edition_type: str | None
) -> list[BookResult | AudiobookResult]:
    ranked: list[BookResult | AudiobookResult] = [
        book for book in rank_books(query, books, limit=None)
        if isinstance(book, AudiobookResult) or book.page_count is not None
    ]
    if edition_type == "audiobook":
        return [book for book in ranked if isinstance(book, AudiobookResult)]
    if edition_type is not None:
        return [book for book in ranked if isinstance(book, BookResult) and book.format == edition_type]
    return ranked


def _preview_books(ranked: list[BookResult | AudiobookResult]) -> list[BookResult | AudiobookResult]:
    editions_per_work: dict[str, int] = {}
    preview = []
    for book in ranked:
        key = work_key(book)
        identity = key.rsplit("|", 1)[0]
        if not identity or identity.endswith("|unknown") or identity.endswith("|"):
            identity = f"{identity}|{book.source}:{book.id}"
        if identity not in editions_per_work and len(editions_per_work) == 10:
            continue
        count = editions_per_work.get(identity, 0)
        if count == 2:
            continue
        editions_per_work[identity] = count + 1
        preview.append(book.model_copy(update={"work_key": key}))
    return preview


async def _search_catalog_events(
    query: str, edition_type: str | None, *, preview: bool = True
) -> AsyncGenerator[tuple[str, SearchResult]]:
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

    async def run[T](search: Callable[[str], Awaitable[T]]) -> T:
        async with asyncio.timeout(CATALOG_TIMEOUT_SECONDS):
            return await search(query)

    tasks = [asyncio.create_task(run(search)) for _, search in providers]
    results: list[list[BookResult] | list[AudiobookResult] | None] = [None] * len(tasks)
    errors: list[BaseException] = []
    previous_preview: list[BookResult | AudiobookResult] = []
    try:
        async with asyncio.timeout(SEARCH_DEADLINE_SECONDS) as budget:
            pending = set(tasks)
            while pending:
                done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
                for index, task in enumerate(tasks):
                    if task not in done:
                        continue
                    name = providers[index][0]
                    try:
                        results[index] = task.result()
                    except (httpx.HTTPError, TimeoutError, SeriesProviderError) as exc:
                        logger.warning("%s search unavailable (%s)", name, type(exc).__name__)
                        errors.append(exc)
                if preview:
                    available = [book for result in results if result for book in result]
                    ranked = _ranked_catalog_books(query, available, edition_type)
                    selected = _preview_books(ranked)
                    if selected and selected != previous_preview:
                        previous_preview = selected
                        sources = [name for (name, _), result in zip(providers, results, strict=True) if result]
                        source = sources[0] if len(sources) == 1 else "combined"
                        deadline = budget.when()
                        budget.reschedule(None)
                        sending_started = monotonic()
                        try:
                            yield "snapshot", SearchResult(
                                books=selected, series=[], source=source, partial=bool(errors)
                            )
                        finally:
                            sending_elapsed = monotonic() - sending_started
                            started += sending_elapsed
                            if deadline is not None:
                                budget.reschedule(deadline + sending_elapsed)

            if all(result is None for result in results):
                status = (
                    504 if any(isinstance(error, (httpx.TimeoutException, TimeoutError)) for error in errors)
                    else 502
                )
                raise HTTPException(status_code=status, detail="Book search unavailable. Try again.")

            books = [book for result in results if result for book in result]
            ranked = _ranked_catalog_books(query, books, edition_type)
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

            ranked = [book.model_copy(update={"work_key": work_key(book)}) for book in ranked]
            sources = [name for (name, _), result in zip(providers, results, strict=True) if result]
            source = sources[0] if len(sources) == 1 else "combined"
            final = SearchResult(books=ranked, series=[], source=source, partial=bool(errors))
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
    yield "final", final
