import asyncio
import re
from contextlib import suppress
from time import monotonic

import httpx

from hon.models.book import BookResult
from hon.services.catalog import folded, isbn_value, rank_books, relevance, search_terms
from hon.services.http import decode_json_object
from hon.services.normalization import first_author, non_empty_string, positive_page_count

OPENLIBRARY_SEARCH_URL = "https://openlibrary.org/search.json"
OPENLIBRARY_COVER_URL = "https://covers.openlibrary.org/b/id/{cover_id}-L.jpg?default=false"
SEARCH_LIMIT = 20
SEARCH_TIMEOUT_SECONDS = 6.0
LANGUAGES = {"pt": "por", "en": "eng", "es": "spa", "fr": "fre", "de": "ger"}
FIELDS = (
    "key,title,author_name,editions,editions.key,editions.title,editions.language,"
    "editions.isbn,editions.cover_i,editions.publisher,editions.publish_date"
)


def normalize(doc: dict) -> BookResult | None:
    # Search works contain translated editions; all display metadata must come from that edition.
    editions = doc.get("editions")
    candidates = editions.get("docs", []) if isinstance(editions, dict) else []
    edition = candidates[0] if candidates and isinstance(candidates[0], dict) else doc
    key = non_empty_string(edition.get("key"))
    title = non_empty_string(edition.get("title"))
    if key is None or title is None:
        return None
    cover_id = edition.get("cover_i")
    codes = edition.get("isbn") or []
    isbn = next((code for value in codes if isinstance(value, str) and (code := isbn_value(value))), None)
    languages = edition.get("language") or []
    language = next((code for code, iso3 in LANGUAGES.items() if iso3 in languages), None)
    publishers = edition.get("publisher") or []
    dates = edition.get("publish_date") or []
    return BookResult(
        id=key.removeprefix("/books/").removeprefix("/works/"),
        title=title,
        author=first_author(doc.get("author_name")),
        page_count=positive_page_count(edition.get("number_of_pages")),
        cover_url=OPENLIBRARY_COVER_URL.format(cover_id=cover_id)
        if isinstance(cover_id, int) and cover_id > 0
        else None,
        cover_fallback_url=f"https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg?default=false" if isbn else None,
        isbn=isbn,
        language=language,
        publisher=non_empty_string(publishers[0]) if isinstance(publishers, list) and publishers else None,
        published_date=non_empty_string(dates[0]) if isinstance(dates, list) and dates else None,
    )


async def search(query: str) -> list[BookResult]:
    deadline = monotonic() + 9.0
    async with httpx.AsyncClient(timeout=SEARCH_TIMEOUT_SECONDS) as client:

        async def lookup(term: str) -> list[BookResult]:
            params = {"q": term, "fields": FIELDS, "limit": SEARCH_LIMIT}
            response = await client.get(OPENLIBRARY_SEARCH_URL, params=params)
            response.raise_for_status()
            data = decode_json_object(response, "OpenLibrary")
            return [
                book for doc in data.get("docs") or [] if isinstance(doc, dict) and (book := normalize(doc)) is not None
            ]

        isbn = isbn_value(query)

        async def candidates(term: str) -> list[BookResult]:
            # Open Library exposes one edition per work. Add a regional pass so
            # Brazilian translations remain discoverable alongside global results.
            # The primary pass and final ranking never exclude any language.
            terms = [term] if isbn else [term, f"{term} language:por"]
            results = await asyncio.gather(*(lookup(value) for value in terms), return_exceptions=True)
            books = []
            failures = []
            for result in results:
                if isinstance(result, (httpx.HTTPError, TimeoutError)):
                    failures.append(result)
                elif isinstance(result, BaseException):
                    raise result
                else:
                    books.extend(result)
            if len(failures) == len(results):
                raise failures[0]
            return books

        books = await candidates(isbn or folded(query))
        if not isbn and not any(relevance(query, book) >= 0.85 for book in books):
            terms = search_terms(query)
            fuzzy = " ".join(f"{word}~1" if len(word) >= 4 else word for word in terms)
            with suppress(httpx.HTTPError, TimeoutError):
                async with asyncio.timeout(max(0.01, deadline - monotonic())):
                    books.extend(await candidates(fuzzy))
        books = rank_books(query, books)
        # Edition page counts aren't indexed by search. Hydrate only the best matches,
        # with two concurrent requests; absence remains explicit instead of using a work median.
        semaphore = asyncio.Semaphore(2)

        async def hydrate(book: BookResult) -> None:
            if book.page_count is not None or not re.fullmatch(r"OL\d+M", book.id):
                return
            async with semaphore:
                try:
                    response = await client.get(f"https://openlibrary.org/books/{book.id}.json", timeout=2.0)
                    response.raise_for_status()
                    data = decode_json_object(response, "OpenLibrary edition")
                    book.page_count = positive_page_count(data.get("number_of_pages"))
                except httpx.HTTPError:
                    pass
                if book.author == "Unknown" and book.isbn:
                    try:
                        response = await client.get(
                            f"https://brasilapi.com.br/api/isbn/v1/{book.isbn}",
                            timeout=2.0,
                        )
                        response.raise_for_status()
                        data = decode_json_object(response, "BrasilAPI ISBN")
                        if isbn_value(str(data.get("isbn", ""))) == book.isbn:
                            book.author = first_author(data.get("authors"))
                            book.page_count = book.page_count or positive_page_count(data.get("page_count"))
                    except httpx.HTTPError:
                        pass

        with suppress(TimeoutError):
            async with asyncio.timeout(max(0.01, deadline - monotonic())):
                await asyncio.gather(*(hydrate(book) for book in books[:4]))
        return books
