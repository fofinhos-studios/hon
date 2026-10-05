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


def rank_books[T: BookResult | AudiobookResult](query: str, books: list[T]) -> list[T]:
    unique: dict[tuple[str, str], T] = {}
    for book in books:
        if relevance(query, book) < 0.68:
            continue
        identity = (
            book.kind,
            book.id if isinstance(book, AudiobookResult) else book.isbn or f"{book.source}:{book.id}",
        )
        if identity in unique:
            existing = unique[identity]
            # Only merge metadata for the same edition, never merely the same title.
            updates = {
                key: getattr(book, key)
                for key in ("cover_url", "cover_fallback_url", "publisher", "published_date", "language")
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
            unique[identity] = existing.model_copy(update=updates)
        else:
            unique[identity] = book

    def order(book: T) -> tuple:
        brazilian = bool(book.isbn and book.isbn.startswith(("97885", "97865")))
        year = re.search(r"(?:19|20)\d{2}", book.published_date or "")
        return (
            relevance(query, book),
            brazilian,
            bool(book.cover_url),
            bool(book.page_count if isinstance(book, BookResult) else book.duration_minutes),
            year.group() if year else "",
        )

    return sorted(unique.values(), key=order, reverse=True)[:40]
