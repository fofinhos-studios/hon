import pytest
from pydantic import ValidationError

from hon.models.book import BookResult


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("id", " "),
        ("title", ""),
        ("author", " "),
        ("page_count", 0),
    ],
)
def test_book_result_rejects_invalid_contract_values(field: str, value: object):
    values: dict[str, object] = {
        "id": "1",
        "title": "Dune",
        "author": "Frank Herbert",
        "page_count": 412,
        "cover_url": None,
    }
    values[field] = value

    with pytest.raises(ValidationError):
        BookResult(**values)
