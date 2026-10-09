"""Read-only Hardcover series search and ordered membership."""

import math
import os
from typing import Any, Literal, cast

import httpx

from hon.models.book import BookResult, SeriesMembership, SeriesResult
from hon.services.catalog import folded, isbn_value
from hon.services.http import decode_json_object
from hon.services.normalization import non_empty_string, positive_page_count

HARDCOVER_URL = "https://api.hardcover.app/v1/graphql"
PAGE_SIZE = 100
SEARCH_QUERY = """
query SearchSeries($query: String!) {
  search(query: $query, query_type: "Series", per_page: 5, page: 1) {
    results
  }
}
"""
SERIES_QUERY = """
query SeriesBooks($slug: String!, $offset: Int!) {
  series(where: {slug: {_eq: $slug}, canonical_id: {_is_null: true}}, limit: 1) {
    id
    name
    author { name }
    primary_books_count
    book_series(
      limit: 100
      offset: $offset
      where: {
        compilation: {_eq: false}
        book: {canonical_id: {_is_null: true}, is_partial_book: {_eq: false}}
      }
      order_by: [{position: asc}, {book: {users_count: desc}}, {book_id: asc}]
    ) {
      position
      book {
        id
        title
        pages
        users_count
        contributions { contribution author { name } }
        default_physical_edition { id pages isbn_13 language { code2 } }
        default_ebook_edition { id pages isbn_13 language { code2 } }
      }
    }
  }
}
"""


class SeriesProviderError(Exception):
    """Hardcover configuration or response cannot supply a trustworthy series list."""


def _object(value: object) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise SeriesProviderError("Hardcover returned an invalid response")
    return cast(dict[str, Any], value)


def _list(value: object) -> list[Any]:
    if not isinstance(value, list):
        raise SeriesProviderError("Hardcover returned an invalid list")
    return value


def _id(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, int) and not isinstance(value, bool):
        return str(value)
    if isinstance(value, str):
        return non_empty_string(value)
    raise SeriesProviderError("Hardcover returned an invalid ID")


def _position(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise SeriesProviderError("Hardcover returned an invalid series position")
    try:
        position = float(value)
    except (ValueError, OverflowError) as exc:
        raise SeriesProviderError("Hardcover returned an invalid series position") from exc
    if not math.isfinite(position):
        raise SeriesProviderError("Hardcover returned an invalid series position")
    return position


def _edition(
    book: dict[str, Any],
) -> tuple[int | None, Literal["physical", "digital", "unspecified"], str | None, str | None]:
    for key in ("default_physical_edition", "default_ebook_edition"):
        book_format: Literal["physical", "digital"] = (
            "physical" if key == "default_physical_edition" else "digital"
        )
        edition = book.get(key)
        if edition is None:
            continue
        edition = _object(edition)
        pages = positive_page_count(edition.get("pages"))
        if pages is None:
            continue
        language = edition.get("language")
        language_code = non_empty_string(_object(language).get("code2")) if language is not None else None
        raw_isbn = edition.get("isbn_13")
        isbn = isbn_value(raw_isbn) if isinstance(raw_isbn, str) else None
        return pages, book_format, isbn, language_code
    return positive_page_count(book.get("pages")), "unspecified", None, None


def _author(book: dict[str, Any], series_author: str) -> str:
    contributions = book.get("contributions")
    if contributions is not None:
        for contribution in _list(contributions):
            item = _object(contribution)
            if folded(str(item.get("contribution") or "")) != "author":
                continue
            author = item.get("author")
            if author is not None and (name := non_empty_string(_object(author).get("name"))):
                return name
    return series_author


def _member(row: object, series_id: str, series_name: str, series_author: str) -> BookResult | None:
    data = _object(row)
    position = _position(data.get("position"))
    raw_book = data.get("book")
    if raw_book is None:
        return None
    book = _object(raw_book)
    book_id = _id(book.get("id"))
    title = non_empty_string(book.get("title"))
    if book_id is None or title is None:
        return None
    pages, book_format, isbn, language = _edition(book)
    return BookResult(
        source="hardcover",
        id=f"hardcover:{book_id}",
        title=title,
        author=_author(book, series_author),
        page_count=pages,
        format=book_format,
        cover_url=None,
        cover_fallback_url=f"https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg?default=false" if isbn else None,
        isbn=isbn,
        language=language,
        series=SeriesMembership(id=series_id, name=series_name, position=position),
    )


def _complete(members: list[BookResult], count: int | None, omitted: bool) -> bool:
    positions = [member.series.position for member in members if member.series and _main(member.series.position)]
    return (
        not omitted
        and (count is None or len(positions) >= count)
        and all(position == index for index, position in enumerate(positions, 1))
    )


def _main(position: float | None) -> bool:
    return position is not None and position > 0 and position.is_integer()


async def _graphql(client: httpx.AsyncClient, query: str, variables: dict[str, object]) -> dict[str, Any]:
    response = await client.post(HARDCOVER_URL, json={"query": query, "variables": variables})
    response.raise_for_status()
    try:
        envelope = decode_json_object(response, "Hardcover")
    except httpx.DecodingError as exc:
        raise SeriesProviderError("Hardcover returned invalid JSON") from exc
    if envelope.get("errors"):
        raise SeriesProviderError("Hardcover returned GraphQL errors")
    if "errors" in envelope and not isinstance(envelope["errors"], list):
        raise SeriesProviderError("Hardcover returned invalid GraphQL errors")
    return _object(envelope.get("data"))


def _member_order(book: BookResult) -> tuple[bool, float, str, str]:
    assert book.series is not None
    position = book.series.position
    return (
        position is None,
        position if position is not None else 0,
        folded(book.title) if position is None else "",
        book.id,
    )


async def _series(client: httpx.AsyncClient, slug: str) -> SeriesResult | None:
    offset = 0
    rows: list[Any] = []
    while True:
        data = await _graphql(client, SERIES_QUERY, {"slug": slug, "offset": offset})
        series_rows = _list(data.get("series"))
        if not series_rows:
            if offset:
                raise SeriesProviderError("Hardcover lost a series during paging")
            return None
        series = _object(series_rows[0])
        series_id = _id(series.get("id"))
        series_name = non_empty_string(series.get("name"))
        if series_id is None or series_name is None:
            raise SeriesProviderError("Hardcover returned an invalid series")
        author_data = series.get("author")
        author = non_empty_string(_object(author_data).get("name")) if author_data is not None else None
        series_author = author or "Unknown"
        count = series.get("primary_books_count")
        if count is not None and (not isinstance(count, int) or isinstance(count, bool) or count < 0):
            raise SeriesProviderError("Hardcover returned an invalid primary book count")
        page = _list(series.get("book_series"))
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    members: list[BookResult] = []
    main_positions: set[float] = set()
    book_ids: set[str] = set()
    omitted = False
    for row in rows:
        book = _member(row, series_id, series_name, series_author)
        if book is None:
            omitted = True
            continue
        position = book.series.position if book.series else None
        if book.id in book_ids or (_main(position) and position in main_positions):
            continue
        book_ids.add(book.id)
        if position is not None and _main(position):
            main_positions.add(position)
        members.append(book)
    if not members:
        return None
    members.sort(key=_member_order)
    return SeriesResult(
        id=series_id, name=series_name, author=series_author, members=members,
        incomplete=not _complete(members, count, omitted),
    )


async def search_series(query: str) -> list[SeriesResult]:
    token = os.getenv("HARDCOVER_API_TOKEN")
    if not token:
        raise SeriesProviderError("Hardcover is not configured")
    async with httpx.AsyncClient(timeout=10.0, headers={"Authorization": f"Bearer {token}"}) as client:
        data = await _graphql(client, SEARCH_QUERY, {"query": query})
        search = _object(data.get("search"))
        hits = _list(_object(search.get("results")).get("hits"))
        results: list[SeriesResult] = []
        seen_slugs: set[str] = set()
        for hit in hits:
            slug = non_empty_string(_object(_object(hit).get("document")).get("slug"))
            if slug is None:
                raise SeriesProviderError("Hardcover returned a series without a slug")
            if slug in seen_slugs:
                continue
            seen_slugs.add(slug)
            series = await _series(client, slug)
            if series is not None:
                results.append(series)
                if len(results) == 3:
                    break
        return results
