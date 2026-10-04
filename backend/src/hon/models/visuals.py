from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints


class VisualRequest(BaseModel):
    id: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=512)]
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=512)]
    author: Annotated[str, StringConstraints(strip_whitespace=True, max_length=256)] = ""
    cover_url: Annotated[str, Field(max_length=2048)] | None = None
    cover_fallback_url: Annotated[str, Field(max_length=2048)] | None = None


class Artwork(BaseModel):
    image_url: str
    source_url: str
    author: str
    license: str


class BookVisuals(BaseModel):
    color_version: int = 2
    dominant_color: str | None = None
    artwork: Artwork | None = None
