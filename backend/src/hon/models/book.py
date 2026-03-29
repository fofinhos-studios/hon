from pydantic import BaseModel


class BookResult(BaseModel):
    id: str
    title: str
    author: str
    page_count: int
    cover_url: str | None
