from unittest.mock import AsyncMock, patch

import httpx
import pytest

from hon.services import publisher_cover as covers
from tests.conftest import async_client

ISBN = "9786559240630"
URL = "https://cdn.shopify.com/s/files/1/0722/9197/5420/files/cover.jpg"


def payload(alt=f"{ISBN}.jpg", url=URL):
    return {"resources": {"results": {"products": [{"featured_image": {"alt": alt, "url": url}}]}}}


@pytest.fixture(autouse=True)
def clear_cache():
    covers._cache.clear()
    covers._in_flight.clear()


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


def test_cover_route_redirects_only_a_resolved_edition(client):
    with patch("hon.routers.books.get_publisher_cover", AsyncMock(return_value=URL)) as lookup:
        result = client.get(f"/books/cover?isbn={ISBN}", follow_redirects=False)
        assert result.status_code == 307
        assert result.headers["location"] == URL
        assert "max-age=3600" in result.headers["cache-control"]
        assert client.get("/books/cover?isbn=9786559240631").status_code == 422
        lookup.assert_awaited_once_with(ISBN)
    with patch("hon.routers.books.get_publisher_cover", AsyncMock(return_value=None)):
        assert client.get(f"/books/cover?isbn={ISBN}").status_code == 404
