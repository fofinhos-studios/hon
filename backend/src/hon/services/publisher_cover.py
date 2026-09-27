"""Recover missing Record-group covers by exact edition ISBN, outside catalog search."""

import asyncio
import re
from collections import OrderedDict
from time import monotonic
from typing import Any
from urllib.parse import urlsplit

import httpx

from hon.services.catalog import isbn_value

SEARCH_URL = "https://www.record.com.br/search/suggest.json"
IMAGE_PREFIX = "/s/files/1/0722/9197/5420/"
_cache: OrderedDict[str, tuple[float, str | None]] = OrderedDict()
_in_flight: dict[str, asyncio.Task[str | None]] = {}


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
