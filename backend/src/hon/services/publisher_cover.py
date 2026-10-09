"""Recover missing covers from the publisher or Google Books."""

import asyncio
import re
from collections import OrderedDict
from time import monotonic
from typing import Any
from urllib.parse import urlsplit

import httpx

from hon.services import google_books
from hon.services.book_visuals import allowed_url
from hon.services.catalog import folded, isbn_value

SEARCH_URL = "https://www.record.com.br/search/suggest.json"
IMAGE_PREFIX = "/s/files/1/0722/9197/5420/"
GOOGLE_COVER_HOSTS = frozenset({"books.google.com", "books.googleusercontent.com"})
_cache: OrderedDict[str, tuple[float, str | None]] = OrderedDict()
_in_flight: dict[str, asyncio.Task[str | None]] = {}
_fallback_cache: OrderedDict[tuple[str, str, str], tuple[float, str | None]] = OrderedDict()
_fallback_in_flight: dict[tuple[str, str, str], asyncio.Task[str | None]] = {}
_google_slots = asyncio.Semaphore(8)


def select_cover(data: Any, isbn: str) -> str | None:
    if not isinstance(data, dict):
        return None
    resources = data.get("resources")
    results = resources.get("results") if isinstance(resources, dict) else None
    products = results.get("products") if isinstance(results, dict) else None
    if not isinstance(products, list):
        return None
    for product in products:
        image = product.get("featured_image") if isinstance(product, dict) else None
        if not isinstance(image, dict) or not re.fullmatch(
            rf"{isbn}\.(?:jpg|jpeg|png|webp)", str(image.get("alt", "")), re.IGNORECASE
        ):
            continue
        url = image.get("url")
        if not isinstance(url, str):
            continue
        try:
            parsed = urlsplit(url)
            if (
                parsed.scheme == "https"
                and parsed.hostname == "cdn.shopify.com"
                and parsed.path.startswith(IMAGE_PREFIX)
                and parsed.port in (None, 443)
                and not parsed.username
                and not parsed.password
            ):
                return url
        except ValueError:
            continue
    return None


async def get_publisher_cover(code: str) -> str | None:
    isbn = isbn_value(code)
    if not isbn:
        return None
    cached = _cache.get(isbn)
    if cached and cached[0] > monotonic():
        _cache.move_to_end(isbn)
        return cached[1]
    task = _in_flight.get(isbn)
    if task is None:
        if len(_in_flight) >= 8:
            return None

        async def lookup():
            try:
                url = None
                try:
                    async with asyncio.timeout(4), httpx.AsyncClient(timeout=3) as client:
                        response = await client.get(
                            SEARCH_URL, params={"q": isbn, "resources[type]": "product", "resources[limit]": 3}
                        )
                        response.raise_for_status()
                        url = select_cover(response.json(), isbn)
                except httpx.HTTPError, ValueError, TimeoutError:
                    pass
                _cache[isbn] = (monotonic() + (3600 if url else 60), url)
                _cache.move_to_end(isbn)
                while len(_cache) > 128:
                    _cache.popitem(last=False)
                return url
            finally:
                _in_flight.pop(isbn, None)

        task = asyncio.create_task(lookup())
        _in_flight[isbn] = task
    return await asyncio.shield(task)


async def get_book_cover(
    code: str | None, title: str | None = None, author: str | None = None
) -> str | None:
    isbn = isbn_value(code) if code else None
    if isbn and (url := await get_publisher_cover(isbn)):
        return url
    if not isbn and not (title and author):
        return None
    key = (isbn or "", folded(title or ""), folded(author or ""))
    cached = _fallback_cache.get(key)
    if cached and cached[0] > monotonic():
        _fallback_cache.move_to_end(key)
        return cached[1]
    task = _fallback_in_flight.get(key)
    if task is None:

        async def lookup():
            try:
                url = None
                async with _google_slots:
                    try:
                        if isbn:
                            books = await google_books.search(isbn)
                            url = next(
                                (
                                    book.cover_url
                                    for book in books
                                    if book.isbn == isbn
                                    and book.cover_url
                                    and allowed_url(book.cover_url, GOOGLE_COVER_HOSTS)
                                ),
                                None,
                            )
                        if not url and title and author:
                            books = await google_books.search(title)
                            url = next(
                                (
                                    book.cover_url
                                    for book in books
                                    if folded(book.title) == key[1]
                                    and folded(book.author) == key[2]
                                    and book.cover_url
                                    and allowed_url(book.cover_url, GOOGLE_COVER_HOSTS)
                                ),
                                None,
                            )
                    except httpx.HTTPError, TimeoutError:
                        pass
                _fallback_cache[key] = (monotonic() + (3600 if url else 60), url)
                _fallback_cache.move_to_end(key)
                while len(_fallback_cache) > 128:
                    _fallback_cache.popitem(last=False)
                return url
            finally:
                _fallback_in_flight.pop(key, None)

        task = asyncio.create_task(lookup())
        _fallback_in_flight[key] = task
    return await asyncio.shield(task)
