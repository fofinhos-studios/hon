from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

NonEmptyString = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class BookResult(BaseModel):
    kind: Literal["page"] = "page"
    format: Literal["physical", "digital", "unspecified"] = "unspecified"
    source: str = ""
    work_key: str = ""
    id: NonEmptyString
    title: NonEmptyString
    author: NonEmptyString
    page_count: Annotated[int, Field(ge=1)] | None
    cover_url: str | None
    cover_fallback_url: str | None = None
    isbn: str | None = None
    language: str | None = None
    publisher: str | None = None
    published_date: str | None = None


class AudiobookResult(BaseModel):
    kind: Literal["audiobook"] = "audiobook"
    source: str = "audiosilo"
    work_key: str = ""
    id: NonEmptyString
    title: NonEmptyString
    author: NonEmptyString
    duration_minutes: Annotated[int, Field(ge=1)] | None
    narrators: list[str] = Field(default_factory=list)
    cover_url: str | None = None
    cover_fallback_url: str | None = None
    isbn: str | None = None
    language: str | None = None
    publisher: str | None = None
    published_date: str | None = None


SearchBook = Annotated[BookResult | AudiobookResult, Field(discriminator="kind")]


class SearchResult(BaseModel):
    books: list[SearchBook]
    source: Literal["google_books", "open_library", "bookinfo", "audiosilo", "combined"]
    partial: bool = False
