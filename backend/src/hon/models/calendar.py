from datetime import date, timedelta
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, model_validator

BookTitle = Annotated[str, StringConstraints(min_length=1, max_length=10_000)]
CalendarEvent = tuple[Annotated[int, Field(ge=0, le=36500)], Annotated[int, Field(ge=0)], Annotated[int, Field(ge=1)]]


class CalendarSnapshot(BaseModel):
    """A fixed reading plan shared by both export endpoints."""

    model_config = ConfigDict(extra="forbid")

    v: Literal[1]
    locale: Literal["en", "pt-BR"]
    created_at: AwareDatetime
    start_date: date
    books: list[BookTitle] = Field(min_length=1, max_length=10_000)
    events: list[CalendarEvent] = Field(min_length=1, max_length=10_000)

    @model_validator(mode="after")
    def validate_events(self) -> CalendarSnapshot:
        for day_offset, book_index, _pages in self.events:
            if book_index >= len(self.books):
                raise ValueError("event references an unknown book")
            try:
                self.start_date + timedelta(days=day_offset + 1)
            except OverflowError as exc:
                raise ValueError("event date is out of range") from exc
        return self
