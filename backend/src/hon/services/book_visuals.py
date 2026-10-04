"""Optional visual enrichment. Catalog search and scheduling never wait for this service."""

import asyncio
import colorsys
import html
import io
import logging
import os
import re
import time
import unicodedata
from collections import OrderedDict
from html.parser import HTMLParser
from urllib.parse import parse_qs, urljoin, urlsplit

import httpx
from PIL import Image, UnidentifiedImageError

from hon.models.visuals import COLOR_ALGORITHM_VERSION, Artwork, BookVisuals, VisualRequest

logger = logging.getLogger(__name__)
COMMONS_URL = "https://commons.wikimedia.org/w/api.php"
COVER_HOSTS = frozenset(
    {
        "books.google.com",
        "books.googleusercontent.com",
        "covers.openlibrary.org",
        "fl-storage.bookinfometadados.com.br",
    }
)
# Publisher PNG covers can exceed 5 MB even at ordinary print dimensions.
MAX_IMAGE_BYTES = 12 * 1024 * 1024
MAX_IMAGE_PIXELS = 16_000_000
MAX_CACHE_ITEMS = 256
MAX_IN_FLIGHT = 8
VISUAL_DEADLINE_SECONDS = 8.0
_cache: OrderedDict[tuple[str, ...], tuple[float, BookVisuals]] = OrderedDict()
_in_flight: dict[tuple[str, ...], asyncio.Task[BookVisuals]] = {}


def allowed_url(url: str, hosts: frozenset[str]) -> bool:
    try:
        parsed = urlsplit(url)
        return (
            parsed.scheme == "https"
            and parsed.hostname in hosts
            and parsed.port in (None, 443)
            and not parsed.username
            and not parsed.password
        )
    except ValueError:
        return False


async def download_cover(client: httpx.AsyncClient, url: str) -> bytes | None:
    if not allowed_url(url, COVER_HOSTS):
        return None
    open_library = urlsplit(url).hostname == "covers.openlibrary.org"
    for _ in range(4):
        if not allowed_url(url, COVER_HOSTS) and not (open_library and archive_cover_url(url)):
            return None
        async with client.stream("GET", url) as response:
            if response.is_redirect:
                url = urljoin(url, response.headers.get("location", ""))
                continue
            response.raise_for_status()
            if not response.headers.get("content-type", "").split(";")[0].startswith("image/"):
                return None
            size = response.headers.get("content-length", "")
            if size.isdigit() and int(size) > MAX_IMAGE_BYTES:
                return None
            data = bytearray()
            async for chunk in response.aiter_bytes():
                data.extend(chunk)
                if len(data) > MAX_IMAGE_BYTES:
                    return None
            return bytes(data)
    return None


def archive_cover_url(url: str) -> bool:
    """Open Library redirects large covers to Internet Archive cover ZIPs.

    Permit only that resource shape, only after an Open Library request.
    """
    parsed = urlsplit(url)
    host = parsed.hostname or ""
    if not (host == "archive.org" or re.fullmatch(r"ia\d+(?:\.(?:us|eu))?\.archive\.org", host)):
        return False
    if not allowed_url(url, frozenset({host})):
        return False
    if host == "archive.org":
        return bool(re.fullmatch(r"/download/[sml]_covers_\d+/[sml]_covers_[\d_]+\.zip/\d+-[SML]\.jpg", parsed.path))
    query = parse_qs(parsed.query)
    return (
        parsed.path == "/view_archive.php"
        and bool(re.fullmatch(r"/\d+/items/[sml]_covers_\d+/[sml]_covers_[\d_]+\.zip", query.get("archive", [""])[0]))
        and bool(re.fullmatch(r"\d+-[SML]\.jpg", query.get("file", [""])[0]))
    )


def dominant_color(data: bytes) -> str | None:
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.width * image.height > MAX_IMAGE_PIXELS:
                return None
            image.thumbnail((96, 96))
            rgba = image.convert("RGBA")
            useful = []
            for pixel in rgba.get_flattened_data():
                if not isinstance(pixel, tuple):
                    continue
                r, g, b, alpha = pixel
                if alpha < 200 or max(r, g, b) < 30 or min(r, g, b) > 225 or max(r, g, b) - min(r, g, b) < 24:
                    continue
                useful.append((r, g, b))
            if len(useful) < image.width * image.height * 0.02:
                return None
            # Count area, not saturation. Group neighboring hues so shadows and
            # highlights of the same color cannot lose to one flat accent.
            # Circular windows also keep reds on either side of 0 degrees together.
            buckets: list[list[tuple[int, int, int]]] = [[] for _ in range(36)]
            for r, g, b in useful:
                hue, _, _ = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
                buckets[int(hue * 36) % 36].append((r, g, b))
            center = max(
                range(36),
                key=lambda i: sum(len(buckets[(i + offset) % 36]) for offset in range(-2, 3)),
            )
            dominant = [pixel for offset in range(-2, 3) for pixel in buckets[(center + offset) % 36]]
            r, g, b = (round(sum(pixel[channel] for pixel in dominant) / len(dominant)) for channel in range(3))
            return f"#{r:02x}{g:02x}{b:02x}"
    except UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError:
        return None


class _TextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str):
        self.parts.append(data)


def plain_text(value: str) -> str:
    parser = _TextParser()
    parser.feed(value)
    return " ".join(html.unescape(" ".join(parser.parts)).split())


def normalized(value: str) -> str:
    text = unicodedata.normalize("NFKD", value).casefold()
    return " ".join(re.findall(r"[^\W_]+", "".join(c for c in text if not unicodedata.combining(c))))


def select_artwork(pages: list, book: VisualRequest) -> Artwork | None:
    title = normalized(book.title)
    author = normalized(book.author)
    known_author = author not in {"", "unknown", "unknown author", "manual entry"}
    for page in sorted((p for p in pages if isinstance(p, dict)), key=lambda p: p.get("index", 999)):
        images = page.get("imageinfo") or []
        if not images or not isinstance(images[0], dict):
            continue
        info = images[0]
        metadata = info.get("extmetadata") or {}
        if not isinstance(metadata, dict):
            continue

        def meta(key: str, metadata=metadata) -> str:
            entry = metadata.get(key)
            return plain_text(entry["value"]) if isinstance(entry, dict) and isinstance(entry.get("value"), str) else ""

        context = normalized(f"{page.get('title', '')} {meta('ImageDescription')} {meta('ObjectName')}")
        # Whole normalized phrases, not fuzzy keyword guesses, avoid unrelated art.
        if f" {title} " not in f" {context} " or (known_author and f" {author} " not in f" {context} "):
            continue
        if not known_author and not {"book", "novel", "illustration", "frontispiece", "livro", "roman"}.intersection(
            normalized(f"{context} {meta('Categories')}").split()
        ):
            continue
        image_url = info.get("thumburl")
        source_url = info.get("descriptionurl")
        creator, license_name = meta("Artist"), meta("LicenseShortName")
        if not creator or not license_name:
            continue
        if not isinstance(image_url, str) or not allowed_url(
            image_url, frozenset({"upload.wikimedia.org", "thumb.wikimedia.org"})
        ):
            continue
        if not isinstance(source_url, str) or not allowed_url(source_url, frozenset({"commons.wikimedia.org"})):
            continue
        mime = info.get("thumbmime", info.get("mime", ""))
        if mime not in {"image/jpeg", "image/png", "image/webp"}:
            continue
        if info.get("width", 0) < 400 or info.get("height", 0) < 250:
            continue
        return Artwork(image_url=image_url, source_url=source_url, author=creator, license=license_name)
    return None


async def find_artwork(client: httpx.AsyncClient, book: VisualRequest) -> Artwork | None:
    author = book.author if normalized(book.author) not in {"manual entry", "unknown", "unknown author"} else ""
    # Strip search operators; the metadata match above is the final relevance gate.
    query = f'"{normalized(book.title)}" {normalized(author)}'
    response = await client.get(
        COMMONS_URL,
        params={
            "action": "query",
            "format": "json",
            "formatversion": 2,
            "generator": "search",
            "gsrsearch": query,
            "gsrnamespace": 6,
            "gsrlimit": 8,
            "prop": "imageinfo",
            "iiprop": "url|size|mime|extmetadata",
            "iiurlwidth": 640,
            "iiextmetadatafilter": "Artist|LicenseShortName|ImageDescription|ObjectName|Categories",
        },
    )
    response.raise_for_status()
    data = response.json()
    query_data = data.get("query", {}) if isinstance(data, dict) else {}
    pages = query_data.get("pages", []) if isinstance(query_data, dict) else []
    return select_artwork(pages, book) if isinstance(pages, list) else None


async def _enrich(book: VisualRequest) -> BookVisuals:
    result = BookVisuals()
    async with httpx.AsyncClient(
        timeout=4.0,
        follow_redirects=False,
        headers={
            "User-Agent": os.getenv("HON_USER_AGENT", "HonReadingPlanner/0.1 (book artwork enrichment)"),
        },
    ) as client:

        async def color():
            for url in (book.cover_url, book.cover_fallback_url):
                if not url:
                    continue
                try:
                    data = await download_cover(client, url)
                    if data:
                        result.dominant_color = await asyncio.to_thread(dominant_color, data)
                        if result.dominant_color:
                            return
                except httpx.HTTPError, ValueError:
                    logger.info("Cover color unavailable")

        async def art():
            try:
                result.artwork = await find_artwork(client, book)
            except httpx.HTTPError, ValueError, TypeError, KeyError:
                logger.info("Commons artwork unavailable")

        try:
            async with asyncio.timeout(VISUAL_DEADLINE_SECONDS):
                await asyncio.gather(color(), art())
        except TimeoutError:
            logger.info("Visual enrichment deadline reached")
    return result


async def get_visuals(book: VisualRequest) -> BookVisuals:
    key = (
        str(COLOR_ALGORITHM_VERSION),
        book.id,
        book.title,
        book.author,
        book.cover_url or "",
        book.cover_fallback_url or "",
    )
    cached = _cache.get(key)
    if cached and cached[0] > time.monotonic():
        _cache.move_to_end(key)
        return cached[1]
    task = _in_flight.get(key)
    if task is None:
        if len(_in_flight) >= MAX_IN_FLIGHT:
            return BookVisuals()

        async def run():
            try:
                result = await _enrich(book)
                ttl = 86400 if result.artwork or result.dominant_color else 3600
                _cache[key] = (time.monotonic() + ttl, result)
                _cache.move_to_end(key)
                while len(_cache) > MAX_CACHE_ITEMS:
                    _cache.popitem(last=False)
                return result
            finally:
                _in_flight.pop(key, None)

        task = asyncio.create_task(run())
        _in_flight[key] = task
    return await asyncio.shield(task)
