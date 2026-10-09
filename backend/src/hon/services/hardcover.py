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

EDITION_MEMBERSHIP_QUERY = """
query EditionMemberships($isbns: [String!]!) {
  editions(where: {isbn_13: {_in: $isbns}}, limit: 100) {
    isbn_13
    book {
      id title canonical_id is_partial_book compilation
      contributions { contribution author { name } }
      featured_book_series { position compilation series { id name canonical_id } }
      book_series { position compilation series { id name canonical_id } }
    }
  }
}
"""
BOOK_SEARCH_QUERY = """
query SearchBooks($query: String!) {
  search(query: $query, query_type: "Book", per_page: 100, page: 1) { ids }
}
"""
BOOK_MEMBERSHIP_QUERY = """
query BookMemberships($ids: [Int!]!) {
  books(where: {id: {_in: $ids}}, limit: 100) {
    id title canonical_id is_partial_book compilation
    contributions { contribution author { name } }
    featured_book_series { position compilation series { id name canonical_id } }
    book_series { position compilation series { id name canonical_id } }
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
    default_language: str | None = None
    for key in ("default_physical_edition", "default_ebook_edition"):
        book_format: Literal["physical", "digital"] = (
            "physical" if key == "default_physical_edition" else "digital"
        )
        edition = book.get(key)
        if edition is None:
            continue
        edition = _object(edition)
        language = edition.get("language")
        language_code = non_empty_string(_object(language).get("code2")) if language is not None else None
        if default_language is None:
            default_language = language_code
        pages = positive_page_count(edition.get("pages"))
        if pages is None:
            continue
        raw_isbn = edition.get("isbn_13")
        isbn = isbn_value(raw_isbn) if isinstance(raw_isbn, str) else None
        return pages, book_format, isbn, language_code
    return positive_page_count(book.get("pages")), "unspecified", None, default_language


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
    main_languages = {
        book.language.casefold()
        for book in members
        if book.language and book.series and _main(book.series.position)
    }
    if len(main_languages) == 1:
        language = next(iter(main_languages))
        members = [
            book for book in members
            if (book.series is not None and _main(book.series.position))
            or book.language is None or book.language.casefold() == language
        ]
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


def _catalog_isbn(value: str | None) -> str | None:
    return isbn_value(value) if value else None


def _membership(row: object) -> SeriesMembership | None:
    if row is None:
        return None
    membership = _object(row)
    if membership.get("compilation") is not False or "position" not in membership:
        return None
    series = _object(membership.get("series"))
    if "canonical_id" not in series or series.get("canonical_id") is not None:
        return None
    series_id = _id(series.get("id"))
    name = non_empty_string(series.get("name"))
    if not series_id or not name:
        return None
    return SeriesMembership(id=series_id, name=name, position=_position(membership.get("position")))


def _book_membership(raw: object) -> tuple[str, tuple[str, str], SeriesMembership | None] | None:
    if raw is None:
        return None
    book = _object(raw)
    if ("canonical_id" not in book or book.get("canonical_id") is not None
            or book.get("is_partial_book") is not False or book.get("compilation") is not False
            or "featured_book_series" not in book):
        return None
    book_id = _id(book.get("id"))
    if book_id is not None and (not book_id.isascii() or not book_id.isdecimal()):
        raise SeriesProviderError("Hardcover returned an invalid book ID")
    title = non_empty_string(book.get("title"))
    author = _author(book, "")
    if not book_id or not title or not folded(author) or folded(author) == "unknown":
        return None
    memberships = {
        (membership.id, membership.name, membership.position): membership
        for raw_membership in _list(book.get("book_series"))
        if (membership := _membership(raw_membership))
    }
    featured = _membership(book["featured_book_series"])
    if featured:
        return book_id, (folded(title), folded(author)), featured
    if len(memberships) != 1:
        return book_id, (folded(title), folded(author)), None
    return book_id, (folded(title), folded(author)), next(iter(memberships.values()))


async def enrich_catalog_books(query: str, books: list[BookResult]) -> list[BookResult]:
    """Attach only verified Hardcover memberships; never replace catalog edition metadata."""
    if not books:
        return books
    isbns = list(dict.fromkeys(
        code for book in books
        if folded(book.author) not in ("", "unknown") and (code := _catalog_isbn(book.isbn))
    ))
    needs_title = any(not book.isbn and folded(book.author) not in ("", "unknown") for book in books)
    if not isbns and not needs_title:
        return books
    token = os.getenv("HARDCOVER_API_TOKEN")
    if not token:
        raise SeriesProviderError("Hardcover is not configured")
    matches: dict[str, tuple[tuple[str, str], SeriesMembership]] = {}
    title_matches: dict[tuple[str, str], list[SeriesMembership | None]] = {}
    async with httpx.AsyncClient(timeout=10.0, headers={"Authorization": f"Bearer {token}"}) as client:
        if isbns:
            editions = _list((await _graphql(client, EDITION_MEMBERSHIP_QUERY, {"isbns": isbns})).get("editions"))
            # A full page could hide conflicting edition records: trust no ISBN in that case.
            if len(editions) < 100:
                grouped: dict[str, list[object]] = {isbn: [] for isbn in isbns}
                for raw in editions:
                    edition = _object(raw)
                    raw_isbn = edition.get("isbn_13")
                    if not isinstance(raw_isbn, str):
                        raise SeriesProviderError("Hardcover returned an invalid edition ISBN")
                    code = _catalog_isbn(raw_isbn)
                    if code in grouped:
                        grouped[code].append(edition.get("book"))
                for code, candidates in grouped.items():
                    if len(candidates) == 1 and (match := _book_membership(candidates[0])) and match[2]:
                        matches[code] = match[1], match[2]
        if needs_title:
            result = _object((await _graphql(client, BOOK_SEARCH_QUERY, {"query": query})).get("search"))
            raw_ids = _list(result.get("ids"))
            if len(raw_ids) < 100:
                ids: list[int] = []
                for raw_id in raw_ids:
                    book_id = _id(raw_id)
                    if book_id is None or not book_id.isascii() or not book_id.isdecimal():
                        raise SeriesProviderError("Hardcover returned an invalid book search ID")
                    try:
                        ids.append(int(book_id))
                    except ValueError as exc:
                        raise SeriesProviderError("Hardcover returned an invalid book search ID") from exc
                if ids:
                    details = await _graphql(client, BOOK_MEMBERSHIP_QUERY, {"ids": list(dict.fromkeys(ids))})
                    candidates = _list(details.get("books"))
                    if len(candidates) >= 100:
                        candidates = []
                    searched_ids = {str(book_id) for book_id in ids}
                    for raw in candidates:
                        if match := _book_membership(raw):
                            book_id, identity, membership = match
                            if book_id in searched_ids:
                                title_matches.setdefault(identity, []).append(membership)
    enriched = []
    for book in books:
        identity = folded(book.title), folded(book.author)
        code = _catalog_isbn(book.isbn)
        match = matches.get(code) if code else None
        membership = match[1] if match and match[0] == identity else None
        if not book.isbn and identity[1] not in ("", "unknown"):
            candidates = title_matches.get(identity, [])
            if len(candidates) == 1 and candidates[0]:
                membership = candidates[0]
        enriched.append(book.model_copy(update={"series": membership}) if membership else book)
    return enriched
