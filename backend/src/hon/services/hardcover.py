"""Read-only Hardcover series search and ordered membership."""

import math
import os
from dataclasses import dataclass
from typing import Any, Literal, cast

import httpx

from hon.models.book import BookResult, SeriesMembership, SeriesResult
from hon.services.catalog import folded, isbn_value
from hon.services.http import decode_json_object
from hon.services.normalization import non_empty_string, positive_page_count

HARDCOVER_URL = "https://api.hardcover.app/v1/graphql"
PAGE_SIZE = 100
SEARCH_PAGE_SIZE = 10
RESULT_LIMIT = 3
SEARCH_QUERY = """
query SearchSeries($query: String!, $page: Int!) {
  search(query: $query, query_type: "Series", per_page: 10, page: $page) {
    results
  }
}
"""
SERIES_QUERY = """
query SeriesBooks($slugs: [String!]!, $offset: Int!) {
  series(where: {slug: {_in: $slugs}, canonical_id: {_is_null: true}}, limit: 10) {
    slug
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


@dataclass(frozen=True)
class _SeriesDetails:
    result: SeriesResult
    count: int | None
    omitted: bool


def _series_details(series: dict[str, Any], rows: list[Any]) -> _SeriesDetails | None:
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
    return _SeriesDetails(
        result=SeriesResult(
            id=series_id, name=series_name, author=series_author, members=members,
            incomplete=not _complete(members, count, omitted),
        ),
        count=count,
        omitted=omitted,
    )

async def _load_series(
    client: httpx.AsyncClient, slugs: list[str],
) -> tuple[list[_SeriesDetails], list[SeriesProviderError | httpx.HTTPError]]:
    if not slugs:
        return [], []
    collected: dict[str, tuple[dict[str, Any], list[Any]]] = {}
    pending = set(slugs)
    failures: list[SeriesProviderError | httpx.HTTPError] = []
    offset = 0
    while pending:
        requested = [slug for slug in slugs if slug in pending]
        try:
            data = await _graphql(client, SERIES_QUERY, {"slugs": requested, "offset": offset})
            pages = _list(data.get("series"))
        except (SeriesProviderError, httpx.HTTPError) as exc:
            failures.append(exc)
            break
        seen: set[str] = set()
        for item in pages:
            slug: str | None = None
            accepted = False
            try:
                series = _object(item)
                slug = non_empty_string(series.get("slug"))
                if slug is None or slug not in pending or slug in seen:
                    raise SeriesProviderError("Hardcover returned an unexpected series")
                seen.add(slug)
                accepted = True
                members = _list(series.get("book_series"))
                if offset:
                    if slug not in collected or _id(series.get("id")) != _id(collected[slug][0].get("id")):
                        raise SeriesProviderError("Hardcover changed a series during paging")
                    collected[slug][1].extend(members)
                else:
                    collected[slug] = (series, members)
                if len(members) < PAGE_SIZE:
                    pending.remove(slug)
            except SeriesProviderError as exc:
                failures.append(exc)
                if accepted and slug is not None:
                    pending.discard(slug)
                    collected.pop(slug, None)
        for slug in set(requested) - seen:
            pending.remove(slug)
            if offset:
                failures.append(SeriesProviderError("Hardcover lost a series during paging"))
                collected.pop(slug, None)
        offset += PAGE_SIZE
    details: list[_SeriesDetails] = []
    for slug in slugs:
        if slug not in collected or slug in pending:
            continue
        series, members = collected[slug]
        try:
            detail = _series_details(series, members)
            if detail is not None:
                details.append(detail)
        except SeriesProviderError as exc:
            failures.append(exc)
    return details, failures


def _series_rank(details: _SeriesDetails) -> tuple[bool, int, int, int]:
    series = details.result
    return (
        not series.incomplete,
        sum(bool(book.series and _main(book.series.position)) for book in series.members),
        len(series.members),
        sum(book.page_count is not None for book in series.members),
    )


def _merge_series(variants: list[_SeriesDetails]) -> SeriesResult:
    if len(variants) == 1:
        return variants[0].result
    best = max(variants, key=_series_rank)
    canonical = best.result
    members = list(canonical.members)
    book_ids = {book.id for book in members}
    positions = {
        book.series.position for book in members
        if book.series and _main(book.series.position)
    }
    optional_isbns: set[str] = set()
    optional: dict[tuple[str, str, str | None], set[str]] = {}
    for book in members:
        if book.series and not _main(book.series.position):
            identity = (
                folded(book.title), folded(book.author),
                book.language.casefold() if book.language else None,
            )
            known_isbns = optional.setdefault(identity, set())
            if book.isbn:
                known_isbns.add(book.isbn)
                optional_isbns.add(book.isbn)
    for variant in variants:
        if variant is best:
            continue
        for book in variant.result.members:
            position = book.series.position if book.series else None
            if book.id in book_ids or (_main(position) and position in positions):
                continue
            identity = (
                folded(book.title), folded(book.author),
                book.language.casefold() if book.language else None,
            )
            if not _main(position):
                known_isbns = optional.get(identity)
                duplicate = (
                    (book.isbn is not None and book.isbn in optional_isbns)
                    or (
                        known_isbns is not None
                        and (book.isbn is None or not known_isbns or book.isbn in known_isbns)
                    )
                )
                known_isbns = optional.setdefault(identity, set())
                if book.isbn:
                    known_isbns.add(book.isbn)
                    optional_isbns.add(book.isbn)
                if duplicate:
                    continue
            members.append(book.model_copy(update={
                "series": SeriesMembership(id=canonical.id, name=canonical.name, position=position),
            }))
            book_ids.add(book.id)
            if _main(position):
                positions.add(position)
    members.sort(key=_member_order)
    count = max((variant.count for variant in variants if variant.count is not None), default=None)
    return canonical.model_copy(update={
        "members": members,
        "incomplete": not _complete(members, count, best.omitted),
    })


async def search_series(query: str) -> list[SeriesResult]:
    token = os.getenv("HARDCOVER_API_TOKEN")
    if not token:
        raise SeriesProviderError("Hardcover is not configured")
    async with httpx.AsyncClient(timeout=10.0, headers={"Authorization": f"Bearer {token}"}) as client:
        groups: list[list[_SeriesDetails]] = []
        seen_slugs: set[str] = set()
        failures: list[SeriesProviderError | httpx.HTTPError] = []
        page = 1
        while len(groups) < RESULT_LIMIT:
            try:
                data = await _graphql(client, SEARCH_QUERY, {"query": query, "page": page})
                search = _object(data.get("search"))
                hits = _list(_object(search.get("results")).get("hits"))
                slugs: list[str] = []
                for hit in hits:
                    slug = non_empty_string(_object(_object(hit).get("document")).get("slug"))
                    if slug is None:
                        raise SeriesProviderError("Hardcover returned a series without a slug")
                    if slug not in seen_slugs:
                        seen_slugs.add(slug)
                        slugs.append(slug)
            except (SeriesProviderError, httpx.HTTPError) as exc:
                if not groups:
                    if isinstance(exc, SeriesProviderError):
                        raise
                    raise SeriesProviderError("Hardcover could not search series") from exc
                failures.append(exc)
                break
            details, detail_failures = await _load_series(client, slugs)
            failures.extend(detail_failures)
            for detail in details:
                identity = (folded(detail.result.name), folded(detail.result.author))
                matches = [
                    group for group in groups
                    if any(
                        entry.result.id == detail.result.id
                        or (folded(entry.result.name), folded(entry.result.author)) == identity
                        for entry in group
                    )
                ]
                if matches:
                    matches[0].append(detail)
                    for group in matches[1:]:
                        matches[0].extend(group)
                        groups.remove(group)
                else:
                    groups.append([detail])
            if len(hits) < SEARCH_PAGE_SIZE:
                break
            page += 1
        if not groups and failures:
            failure = failures[0]
            if isinstance(failure, SeriesProviderError):
                raise failure
            raise SeriesProviderError("Hardcover could not load any series") from failure
        results = [_merge_series(group) for group in groups[:RESULT_LIMIT]]
        if failures:
            return [series.model_copy(update={"incomplete": True}) for series in results]
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
