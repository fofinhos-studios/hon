"""Public, factual audiobook metadata from AudioSilo Meta."""

import asyncio

import httpx

from hon.models.book import AudiobookResult
from hon.services.catalog import isbn_value
from hon.services.http import decode_json_object
from hon.services.normalization import non_empty_string, positive_page_count

BASE_URL = "https://meta.audiosilo.app/api/v1"
SEARCH_LIMIT = 8


def normalize(work: dict, recording: dict) -> AudiobookResult | None:
    work_id = non_empty_string(work.get("id"))
    recording_id = non_empty_string(recording.get("id"))
    title = non_empty_string(work.get("title"))
    if not work_id or not recording_id or not title:
        return None
    authors = work.get("authors")
    author_names = (
        [name for person in authors if isinstance(person, dict) and (name := non_empty_string(person.get("name")))]
        if isinstance(authors, list)
        else []
    )
    narrators = recording.get("narrators")
    narrator_names = (
        [name for person in narrators if isinstance(person, dict) and (name := non_empty_string(person.get("name")))]
        if isinstance(narrators, list)
        else []
    )
    isbns = recording.get("isbn")
    isbn = (
        next((code for value in isbns if isinstance(value, str) and (code := isbn_value(value))), None)
        if isinstance(isbns, list)
        else None
    )
    return AudiobookResult(
        id=f"audiosilo:{work_id}:{recording_id}",
        title=title,
        author=", ".join(author_names) or "Unknown",
        duration_minutes=positive_page_count(recording.get("runtime_min")),
        narrators=narrator_names,
        # The factual catalog is CC0; linked retailer artwork has separate rights.
        cover_url=None,
        isbn=isbn,
        language=non_empty_string(work.get("language")),
        publisher=non_empty_string(recording.get("publisher")),
        published_date=non_empty_string(recording.get("release_date")),
    )


async def search(query: str) -> list[AudiobookResult]:
    async with httpx.AsyncClient(timeout=4.0, follow_redirects=True) as client:
        response = await client.get(f"{BASE_URL}/works/search", params={"q": query, "limit": SEARCH_LIMIT})
        response.raise_for_status()
        data = decode_json_object(response, "AudioSilo")
        works = data.get("results")
        if not isinstance(works, list):
            return []
        semaphore = asyncio.Semaphore(3)

        async def detail(work: dict) -> list[AudiobookResult]:
            work_id = non_empty_string(work.get("id"))
            if not work_id:
                return []
            async with semaphore:
                response = await client.get(f"{BASE_URL}/works/{work_id}")
                response.raise_for_status()
                full_work = decode_json_object(response, "AudioSilo work")
            recordings = full_work.get("recordings")
            return (
                [
                    book
                    for recording in recordings
                    if isinstance(recording, dict) and (book := normalize(full_work, recording))
                ]
                if isinstance(recordings, list)
                else []
            )

        results = await asyncio.gather(
            *(detail(work) for work in works[:SEARCH_LIMIT] if isinstance(work, dict)), return_exceptions=True
        )
        books = []
        failures = []
        for result in results:
            if isinstance(result, httpx.HTTPError):
                failures.append(result)
            elif isinstance(result, BaseException):
                raise result
            else:
                books.extend(result)
        if failures and not books:
            raise failures[0]
        return books
