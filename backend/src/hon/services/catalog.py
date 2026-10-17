"""Shared edition identity and accent/typo-tolerant ranking."""

import re
import unicodedata
from difflib import SequenceMatcher

from hon.models.book import AudiobookResult, BookResult, SearchBook

STOP_WORDS = {"a", "o", "as", "os", "de", "do", "da", "e", "que", "the", "of", "and", "in"}


def folded(value: str) -> str:
    text = "".join(c for c in unicodedata.normalize("NFKD", value.casefold()) if not unicodedata.combining(c))
    return " ".join(re.findall(r"[^\W_]+", text, re.UNICODE))


def isbn_value(value: str) -> str | None:
    code = re.sub(r"[\s-]", "", value).upper()
    if re.fullmatch(r"\d{13}", code):
        return code if sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(code)) % 10 == 0 else None
    if re.fullmatch(r"\d{9}[\dX]", code):
        if sum((10 if c == "X" else int(c)) * (10 - i) for i, c in enumerate(code)) % 11:
            return None
        base = "978" + code[:9]
        check = (-sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(base))) % 10
        return base + str(check)
    return None


def search_terms(query: str) -> list[str]:
    terms = [term for term in folded(query).split() if term not in STOP_WORDS]
    return terms or folded(query).split()


def relevance(query: str, book: SearchBook) -> float:
    isbn = isbn_value(query)
    if isbn:
        return 1.0 if book.isbn == isbn else 0.0
    query_text, title = folded(query), folded(book.title)
    if query_text == title:
        return 1.0
    terms = search_terms(query)
    words = search_terms(f"{book.title} {book.author}")
    if not words or not terms:
        return 0.0
    # Each query token must approximately match; a single shared word is insufficient.
    matches = [max(SequenceMatcher(None, term, word).ratio() for word in words) for term in terms]
    if min(matches) < 0.5:
        return 0.0
    score = sum(matches) / len(matches)
    if query_text in title:
        return 0.92
    # Prefer the intended short title over a box set or sequel for a misspelled query.
    phrase_similarity = max(
        SequenceMatcher(None, query_text, text).ratio()
        for text in (title, folded(book.author), folded(f"{book.title} {book.author}"))
    )
    return 0.89 * (0.7 * score + 0.3 * phrase_similarity)


def work_key(book: SearchBook) -> str:
    title = re.sub(r"\s*\((?:unabridged|abridged|audiobook)\)\s*$", "", book.title, flags=re.I)
    return "|".join((folded(title), folded(book.author), (book.language or "und").casefold()))


def usable(book: SearchBook) -> bool:
    return bool(
        (book.page_count if isinstance(book, BookResult) else book.duration_minutes)
        or book.cover_url
        or book.isbn
        or book.publisher
        or book.published_date
        or (book.author and folded(book.author) != "unknown")
        or (isinstance(book, AudiobookResult) and book.narrators)
    )


def _same_edition(first: BookResult | AudiobookResult, second: BookResult | AudiobookResult) -> bool:
    if isinstance(first, AudiobookResult) or isinstance(second, AudiobookResult):
        if not isinstance(first, AudiobookResult) or not isinstance(second, AudiobookResult):
            return False
        return (
            first.id == second.id
            and folded(first.title) == folded(second.title)
            and (not first.author or not second.author or folded(first.author) == folded(second.author))
            and (not first.language or not second.language or folded(first.language) == folded(second.language))
            and (not first.isbn or not second.isbn or first.isbn == second.isbn)
            and (
                first.duration_minutes is None or second.duration_minutes is None
                or first.duration_minutes == second.duration_minutes
            )
            and (
                not first.narrators or not second.narrators
                or [folded(name) for name in first.narrators] == [folded(name) for name in second.narrators]
            )
        )

    if first.isbn or second.isbn:
        if not first.isbn or first.isbn != second.isbn:
            return False
    elif (
        folded(first.title) != folded(second.title)
        or folded(first.author) != folded(second.author)
        or folded(first.author) == "unknown"
        or not first.language
        or folded(first.language) != folded(second.language or "")
    ):
        return False

    if first.page_count is not None and second.page_count is not None and first.page_count != second.page_count:
        return False
    if first.format != "unspecified" and second.format != "unspecified" and first.format != second.format:
        return False
    if first.language and second.language and folded(first.language) != folded(second.language):
        return False
    if (
        folded(first.author) != "unknown" and folded(second.author) != "unknown"
        and folded(first.author) != folded(second.author)
    ):
        return False
    if first.series and second.series:
        if first.series.id != second.series.id:
            return False
        if (
            first.series.position is not None and second.series.position is not None
            and first.series.position != second.series.position
        ):
            return False
    if first.isbn:
        return True

    if (
        first.published_date and second.published_date
        and folded(first.published_date) != folded(second.published_date)
    ):
        return False
    if first.publisher and second.publisher and folded(first.publisher) != folded(second.publisher):
        return False
    if first.source == second.source and first.id == second.id:
        return True
    return bool(
        (first.published_date and second.published_date)
        or (first.page_count is not None and first.page_count == second.page_count)
        or (
            first.publisher and second.publisher and first.format != "unspecified"
            and first.format == second.format
        )
    )


def rank_books[T: BookResult | AudiobookResult](
    query: str, books: list[T], *, include_unrelated: bool = False, limit: int | None = 40
) -> list[T]:
    # Resolve dated publications first, so an undated record cannot attach itself
    # to one of several otherwise indistinguishable dated editions by input order.
    unique: list[T] = []
    ordered = sorted(
        books,
        key=lambda book: isinstance(book, BookResult) and not book.isbn and not book.published_date,
    )
    for book in ordered:
        if not usable(book) or (not include_unrelated and relevance(query, book) < 0.68):
            continue
        matches = [index for index, existing in enumerate(unique) if _same_edition(existing, book)]
        if len(matches) == 1:
            index = matches[0]
            existing = unique[index]
            # Only merge metadata for the same edition, never merely the same title.
            updates = {
                key: getattr(book, key)
                for key in (
                    "cover_url", "cover_fallback_url", "publisher", "published_date", "language", "series", "isbn"
                )
                if getattr(existing, key) is None and getattr(book, key) is not None
            }
            if isinstance(existing, BookResult) and isinstance(book, BookResult):
                if existing.page_count is None and book.page_count is not None:
                    updates["page_count"] = book.page_count
                if existing.format == "unspecified" and book.format != "unspecified":
                    updates["format"] = book.format
            if isinstance(existing, AudiobookResult) and isinstance(book, AudiobookResult):
                if existing.duration_minutes is None and book.duration_minutes is not None:
                    updates["duration_minutes"] = book.duration_minutes
                if not existing.narrators and book.narrators:
                    updates["narrators"] = book.narrators
            if existing.author == "Unknown" and book.author != "Unknown":
                updates["author"] = book.author
            if existing.cover_url and book.cover_url and existing.cover_url != book.cover_url:
                updates["cover_fallback_url"] = book.cover_url
            unique[index] = existing.model_copy(update=updates)
        else:
            unique.append(book)

    def order(book: T) -> tuple:
        brazilian = bool(book.isbn and book.isbn.startswith(("97885", "97865")))
        year = re.search(r"(?:19|20)\d{2}", book.published_date or "")
        return (
            relevance(query, book),
            bool(book.page_count if isinstance(book, BookResult) else book.duration_minutes),
            bool(book.cover_url),
            bool(book.publisher or book.published_date or book.isbn or folded(book.author) != "unknown"),
            brazilian,
            year.group() if year else "",
        )

    ranked = sorted(unique, key=order, reverse=True)
    return ranked[:limit] if limit is not None else ranked
