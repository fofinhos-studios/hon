import os

import httpx

from hon.models.book import BookResult
from hon.services.catalog import isbn_value
from hon.services.http import decode_json_object
from hon.services.normalization import first_author, non_empty_string, positive_page_count

GOOGLE_BOOKS_URL = "https://www.googleapis.com/books/v1/volumes"
SEARCH_LIMIT = 20
SEARCH_TIMEOUT_SECONDS = 4.0


def _normalize_cover_url(url: str | None) -> str | None:
    if not url:
        return None
    return url.replace("http://", "https://", 1)


def normalize(item: dict) -> BookResult | None:
    info = item.get("volumeInfo", {})
    if not isinstance(info, dict):
        return None
    book_id = non_empty_string(item.get("id"))
    title = non_empty_string(info.get("title"))
    page_count = positive_page_count(info.get("pageCount"))
    if book_id is None or title is None:
        return None
    authors = info.get("authors") or []
    image_links = info.get("imageLinks") or {}
    cover_url = None
    if isinstance(image_links, dict):
        for size in ("extraLarge", "large", "medium", "small", "thumbnail", "smallThumbnail"):
            if isinstance(image_links.get(size), str):
                cover_url = _normalize_cover_url(image_links[size])
                break
    identifiers = info.get("industryIdentifiers") or []
    isbn = next(
        (
            code
            for identifier in identifiers
            if isinstance(identifier, dict) and (code := isbn_value(str(identifier.get("identifier", ""))))
        ),
        None,
    )
    return BookResult(
        id=book_id,
        title=title,
        author=first_author(authors),
        page_count=page_count,
        cover_url=cover_url,
        cover_fallback_url=f"https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg?default=false" if isbn else None,
        isbn=isbn,
        language=non_empty_string(info.get("language")),
        publisher=non_empty_string(info.get("publisher")),
        published_date=non_empty_string(info.get("publishedDate")),
    )


async def search(query: str) -> list[BookResult]:
    api_key = os.getenv("GOOGLE_BOOKS_API_KEY")
    if not api_key:
        return []

    params = {
        "q": f"isbn:{isbn_value(query)}" if isbn_value(query) else query,
        "maxResults": SEARCH_LIMIT,
        "printType": "books",
        "key": api_key,
    }
    async with httpx.AsyncClient(timeout=SEARCH_TIMEOUT_SECONDS) as client:
        response = await client.get(
            GOOGLE_BOOKS_URL,
            params=params,
        )
        response.raise_for_status()
        data = decode_json_object(response, "Google Books")
    return [
        book for item in data.get("items") or [] if isinstance(item, dict) and (book := normalize(item)) is not None
    ]
