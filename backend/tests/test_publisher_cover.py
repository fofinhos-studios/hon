from unittest.mock import AsyncMock, patch

import httpx
import pytest

from hon.models.book import BookResult
from hon.services import publisher_cover as covers
from tests.conftest import async_client

ISBN = "9786559240630"
URL = "https://cdn.shopify.com/s/files/1/0722/9197/5420/files/cover.jpg"


def payload(alt=f"{ISBN}.jpg", url=URL):
    return {"resources": {"results": {"products": [{"featured_image": {"alt": alt, "url": url}}]}}}


def google_book(
    isbn: str,
    title: str = "The Eye of the World",
    author: str = "Robert Jordan",
    url: str = "https://books.google.com/books/content?id=valid",
):
    return BookResult(
        id="google:volume",
        title=title,
        author=author,
        page_count=300,
        isbn=isbn,
        cover_url=url,
    )


@pytest.fixture(autouse=True)
def clear_cache():
    covers._cache.clear()
    covers._in_flight.clear()
    covers._fallback_cache.clear()
    covers._fallback_in_flight.clear()


def test_requires_exact_isbn_and_publisher_asset():
    assert covers.select_cover(payload(), ISBN) == URL
    for data in [
        None,
        [],
        {},
        {"resources": None},
        payload("9786559244225.jpg"),
        payload(f"{ISBN}_quartacapa.jpg"),
        payload(url="https://example.com/cover.jpg"),
        payload(url="https://cdn.shopify.com/s/files/another-shop/a.jpg"),
        payload(url="https://user@cdn.shopify.com/s/files/1/0722/9197/5420/a.jpg"),
    ]:
        assert covers.select_cover(data, ISBN) is None


@pytest.mark.asyncio
async def test_cover_lookup_is_cached_and_uses_isbn():
    client = async_client(payload())
    with patch("hon.services.publisher_cover.httpx.AsyncClient", return_value=client):
        assert await covers.get_publisher_cover(ISBN) == URL
        assert await covers.get_publisher_cover(ISBN) == URL
    assert client.get.call_count == 1
    assert client.get.call_args.kwargs["params"]["q"] == ISBN


@pytest.mark.asyncio
async def test_timeout_and_invalid_isbn_are_non_blocking():
    client = async_client()
    client.get.side_effect = httpx.ReadTimeout("timeout")
    with patch("hon.services.publisher_cover.httpx.AsyncClient", return_value=client):
        assert await covers.get_publisher_cover("invalid") is None
        assert await covers.get_publisher_cover(ISBN) is None
        assert await covers.get_publisher_cover(ISBN) is None
    assert client.get.call_count == 1


@pytest.mark.asyncio
async def test_cover_lookup_uses_google_edition_only_after_publisher_misses():
    client = async_client(payload(alt="another-isbn.jpg"))
    cover = google_book(ISBN)
    with (
        patch("hon.services.publisher_cover.httpx.AsyncClient", return_value=client),
        patch("hon.services.publisher_cover.google_books.search", AsyncMock(return_value=[cover])) as search,
    ):
        assert await covers.get_book_cover(ISBN) == cover.cover_url
        assert await covers.get_book_cover(ISBN) == cover.cover_url
        search.assert_awaited_once_with(ISBN)


@pytest.mark.asyncio
async def test_cover_lookup_rejects_wrong_edition_and_uses_matching_work():
    client = async_client(payload(alt="another-isbn.jpg"))
    cover = google_book("9781429959810")
    with (
        patch("hon.services.publisher_cover.httpx.AsyncClient", return_value=client),
        patch("hon.services.publisher_cover.google_books.search", AsyncMock(side_effect=[[cover], [cover]])) as search,
    ):
        assert await covers.get_book_cover(ISBN, "The Eye of the World", "Robert Jordan") == cover.cover_url
        assert search.await_args_list[0].args == (ISBN,)
        assert search.await_args_list[1].args == ("The Eye of the World",)


@pytest.mark.asyncio
async def test_cover_lookup_rejects_unrelated_or_unsafe_google_results():
    client = async_client(payload(alt="another-isbn.jpg"))
    wrong_author = google_book("9781429959810", author="Another Author")
    unsafe = google_book("9781429959810", url="https://example.com/cover.jpg")
    with (
        patch("hon.services.publisher_cover.httpx.AsyncClient", return_value=client),
        patch("hon.services.publisher_cover.google_books.search", AsyncMock(side_effect=[[], [wrong_author, unsafe]])),
    ):
        assert await covers.get_book_cover(ISBN, "The Eye of the World", "Robert Jordan") is None


@pytest.mark.asyncio
async def test_cover_lookup_by_title_recovers_books_without_an_isbn():
    cover = google_book("9781429959810")
    with (
        patch("hon.services.publisher_cover.httpx.AsyncClient") as client,
        patch("hon.services.publisher_cover.google_books.search", AsyncMock(return_value=[cover])),
    ):
        assert await covers.get_book_cover(None, "The Eye of the World", "Robert Jordan") == cover.cover_url
        client.assert_not_called()


def test_cover_route_redirects_only_a_resolved_edition(client):
    with patch("hon.routers.books.get_book_cover", AsyncMock(return_value=URL)) as lookup:
        result = client.get(f"/books/cover?isbn={ISBN}", follow_redirects=False)
        assert result.status_code == 307
        assert result.headers["location"] == URL
        assert "max-age=3600" in result.headers["cache-control"]
        assert client.get("/books/cover?isbn=9786559240631").status_code == 422
        lookup.assert_awaited_once_with(ISBN, None, None)
    with patch("hon.routers.books.get_book_cover", AsyncMock(return_value=None)):
        assert client.get(f"/books/cover?isbn={ISBN}").status_code == 404
        assert (
            client.get("/books/cover?title=The%20Eye%20of%20the%20World&author=Robert%20Jordan").status_code
            == 404
        )
        assert client.get("/books/cover").status_code == 422
