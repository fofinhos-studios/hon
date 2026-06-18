from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

NonEmptyString = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class BookResult(BaseModel):
    id: NonEmptyString
    title: NonEmptyString
    author: NonEmptyString
    page_count: Annotated[int, Field(ge=1)]
    cover_url: str | None


class SearchResult(BaseModel):
    books: list[BookResult]
    source: Literal["google_books", "open_library"]
