from typing import Literal

from pydantic import BaseModel


class BookResult(BaseModel):
    id: str
    title: str
    author: str
    page_count: int
    cover_url: str | None


class SearchResult(BaseModel):
    books: list[BookResult]
    source: Literal["google_books", "open_library"]
