import json
import os
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from hon.services.google_books import SEARCH_LIMIT, normalize, search
from tests.conftest import async_client, response


def item(book_id: str = "gb-1", pages: object = 100, title: str = "Dune") -> dict:
    return {"id": book_id, "volumeInfo": {"title": title, "pageCount": pages}}


def test_normalize_filters_malformed_items():
    assert normalize({"volumeInfo": {"title": "Missing ID", "pageCount": 10}}) is None
    assert normalize(item(pages="many")) is None
    assert normalize(item(title="   ")) is None
    assert normalize({"volumeInfo": []}) is None


def test_normalize_defaults_missing_author_and_cover():
    book = normalize(item())
    assert book is not None
    assert book.author == "Unknown"
    assert book.cover_url is None

    empty_cover = item()
    empty_cover["volumeInfo"]["imageLinks"] = {"thumbnail": ""}
    normalized_empty_cover = normalize(empty_cover)
    assert normalized_empty_cover is not None
    assert normalized_empty_cover.cover_url is None


def test_normalize_defaults_blank_author():
    value = item()
    value["volumeInfo"]["authors"] = ["   "]

    book = normalize(value)

    assert book is not None
    assert book.author == "Unknown"


def test_normalize_uses_the_first_valid_author():
    value = item()
    value["volumeInfo"]["authors"] = ["Frank Herbert"]

    book = normalize(value)

    assert book is not None
    assert book.author == "Frank Herbert"


def test_normalize_cover_uses_https():
    value = item()
    value["volumeInfo"]["imageLinks"] = {"thumbnail": "http://books.google.com/cover.jpg"}
    book = normalize(value)
    assert book is not None
    assert book.cover_url == "https://books.google.com/cover.jpg"


@pytest.mark.asyncio
async def test_search_queries_once():
    client = async_client({"items": [item("dune")]})
    with (
        patch.dict(os.environ, {"GOOGLE_BOOKS_API_KEY": "key"}),
        patch("hon.services.google_books.httpx.AsyncClient", return_value=client),
    ):
        books = await search("dune")

    assert [book.id for book in books] == ["dune"]
    assert client.get.call_count == 1
    assert client.get.call_args.kwargs["params"]["q"] == "dune"


@pytest.mark.asyncio
async def test_search_rejects_malformed_response_root():
    with (
        patch.dict(os.environ, {"GOOGLE_BOOKS_API_KEY": "key"}),
        patch("hon.services.google_books.httpx.AsyncClient", return_value=async_client([])),
        pytest.raises(httpx.DecodingError),
    ):
        await search("dune")


@pytest.mark.asyncio
async def test_search_translates_malformed_json():
    client = async_client()
    client.get = AsyncMock(return_value=response(json_error=json.JSONDecodeError("bad", "", 0)))
    with (
        patch.dict(os.environ, {"GOOGLE_BOOKS_API_KEY": "key"}),
        patch("hon.services.google_books.httpx.AsyncClient", return_value=client),
        pytest.raises(httpx.DecodingError),
    ):
        await search("dune")


@pytest.mark.asyncio
async def test_search_returns_empty_without_an_api_key():
    with patch.dict(os.environ, {}, clear=True):
        assert await search("dune") == []


@pytest.mark.asyncio
async def test_search_stops_after_the_result_limit():
    client = async_client({"items": [item(f"book-{index}") for index in range(SEARCH_LIMIT)]})
    with (
        patch.dict(os.environ, {"GOOGLE_BOOKS_API_KEY": "key"}),
        patch("hon.services.google_books.httpx.AsyncClient", return_value=client),
    ):
        books = await search("dune")

    assert len(books) == SEARCH_LIMIT
