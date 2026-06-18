import httpx

from hon.models.book import BookResult
from hon.services.http import decode_json_object
from hon.services.normalization import first_author, non_empty_string, positive_page_count

OPENLIBRARY_SEARCH_URL = "https://openlibrary.org/search.json"
OPENLIBRARY_COVER_URL = "https://covers.openlibrary.org/b/id/{cover_id}-M.jpg"
SEARCH_LIMIT = 10
SEARCH_TIMEOUT_SECONDS = 15.0


def normalize(doc: dict) -> BookResult | None:
    key = non_empty_string(doc.get("key"))
    title = non_empty_string(doc.get("title"))
    page_count = positive_page_count(doc.get("number_of_pages_median"))
    if key is None or title is None or page_count is None:
        return None
    cover_id = doc.get("cover_i")
    authors = doc.get("author_name") or []
    return BookResult(
        id=key.removeprefix("/works/"),
        title=title,
        author=first_author(authors),
        page_count=page_count,
        cover_url=OPENLIBRARY_COVER_URL.format(cover_id=cover_id) if cover_id else None,
    )


async def search(query: str) -> list[BookResult]:
    params = {
        "q": query,
        "fields": "key,title,author_name,number_of_pages_median,cover_i",
        "limit": SEARCH_LIMIT,
    }
    async with httpx.AsyncClient(timeout=SEARCH_TIMEOUT_SECONDS) as client:
        response = await client.get(OPENLIBRARY_SEARCH_URL, params=params)
        response.raise_for_status()
        data = decode_json_object(response, "OpenLibrary")
    return [book for doc in data.get("docs") or [] if isinstance(doc, dict) and (book := normalize(doc)) is not None]
