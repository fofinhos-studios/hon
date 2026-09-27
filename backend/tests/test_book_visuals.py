import asyncio
import io
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from PIL import Image

from hon.models.visuals import BookVisuals, VisualRequest
from hon.services import book_visuals as visuals

BOOK = VisualRequest(id="a", title="Pride and Prejudice", author="Jane Austen")


def png(color, size=(24, 24)):
    data = io.BytesIO()
    Image.new("RGBA", size, color).save(data, "PNG")
    return data.getvalue()


def artwork_page(description="Illustration from Pride and Prejudice by Jane Austen"):
    return {
        "title": "File:Illustration.jpg",
        "index": 1,
        "imageinfo": [
            {
                "thumburl": "https://upload.wikimedia.org/illustration.jpg",
                "descriptionurl": "https://commons.wikimedia.org/wiki/File:Illustration.jpg",
                "width": 1000,
                "height": 800,
                "mime": "image/jpeg",
                "extmetadata": {
                    "ImageDescription": {"value": description},
                    "Artist": {"value": "<a href='/artist'>Hugh Thomson</a>"},
                    "LicenseShortName": {"value": "Public domain"},
                },
            }
        ],
    }


@pytest.fixture(autouse=True)
def clear_cache():
    visuals._cache.clear()
    visuals._in_flight.clear()
    yield
    visuals._cache.clear()


def test_color_ignores_transparency_and_monochrome():
    assert visuals.dominant_color(png((180, 70, 40, 255))) == "#b44628"
    for color in [(255, 255, 255, 255), (0, 0, 0, 255), (100, 100, 100, 255), (255, 0, 0, 0)]:
        assert visuals.dominant_color(png(color)) is None


def test_color_rejects_invalid_and_oversized_images(monkeypatch):
    assert visuals.dominant_color(b"not an image") is None
    monkeypatch.setattr(visuals, "MAX_IMAGE_PIXELS", 100)
    assert visuals.dominant_color(png((200, 0, 0, 255))) is None


@pytest.mark.parametrize(
    "url",
    [
        "http://covers.openlibrary.org/a.jpg",
        "https://127.0.0.1/a.jpg",
        "file:///a.jpg",
        "https://covers.openlibrary.org.evil.test/a.jpg",
        "https://user@covers.openlibrary.org/a.jpg",
        "https://covers.openlibrary.org:8080/a.jpg",
    ],
)
async def test_cover_rejects_untrusted_urls_without_request(url):
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: pytest.fail("Unexpected request"))) as client:
        assert await visuals.download_cover(client, url) is None


async def test_redirect_is_checked_before_following():
    calls = []

    def respond(request):
        calls.append(request.url)
        return httpx.Response(302, headers={"location": "https://127.0.0.1/internal"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        assert await visuals.download_cover(client, "https://covers.openlibrary.org/a.jpg") is None
    assert len(calls) == 1


async def test_open_library_archive_cover_redirects():
    data = png((100, 150, 40, 255))

    def respond(request):
        if request.url.host == "covers.openlibrary.org":
            return httpx.Response(
                302,
                headers={
                    "location": "https://archive.org/download/l_covers_0014/l_covers_0014_34.zip/0014348537-L.jpg"
                },
            )
        if request.url.host == "archive.org":
            return httpx.Response(
                302,
                headers={
                    "location": "https://ia600505.us.archive.org/view_archive.php?archive=/35/items/l_covers_0014/l_covers_0014_34.zip&file=0014348537-L.jpg"
                },
            )
        return httpx.Response(200, content=data, headers={"content-type": "image/jpeg"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        assert await visuals.download_cover(client, "https://covers.openlibrary.org/b/id/14348537-L.jpg") == data
    assert not visuals.archive_cover_url("https://archive.org/download/unrelated/file.jpg")
    assert not visuals.archive_cover_url("https://ia600505.us.archive.org/private")


async def test_cover_limits_and_valid_download(monkeypatch):
    data = png((20, 120, 80, 255))
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda _: httpx.Response(200, content=data, headers={"content-type": "image/png"})
        )
    ) as client:
        assert await visuals.download_cover(client, "https://covers.openlibrary.org/a.jpg") == data
        monkeypatch.setattr(visuals, "MAX_IMAGE_BYTES", 5)
        assert await visuals.download_cover(client, "https://covers.openlibrary.org/a.jpg") is None


def test_art_requires_title_author_and_usable_credit():
    art = visuals.select_artwork([artwork_page()], BOOK)
    assert art is not None
    assert art.author == "Hugh Thomson"
    assert art.license == "Public domain"
    assert visuals.select_artwork([artwork_page("Pride and Prejudice by Someone Else")], BOOK) is None
    assert visuals.select_artwork([artwork_page("Another novel by Jane Austen")], BOOK) is None
    missing_credit = artwork_page()
    del missing_credit["imageinfo"][0]["extmetadata"]["Artist"]
    assert visuals.select_artwork([missing_credit], BOOK) is None
    only_category = artwork_page("Jane Austen's bookshelf")
    only_category["imageinfo"][0]["extmetadata"]["Categories"] = {"value": "Pride and Prejudice"}
    assert visuals.select_artwork([only_category], BOOK) is None
    thumbnail = artwork_page()
    thumbnail["imageinfo"][0]["thumburl"] = "https://thumb.wikimedia.org/illustration.jpg"
    assert visuals.select_artwork([thumbnail], BOOK) is not None


async def test_commons_query_uses_file_namespace_and_thumbnail_metadata():
    def respond(request):
        assert request.url.params["gsrnamespace"] == "6"
        assert request.url.params["iiurlwidth"] == "960"
        return httpx.Response(200, json={"query": {"pages": [artwork_page()]}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        assert await visuals.find_artwork(client, BOOK) is not None


async def test_cache_deduplicates_concurrent_requests_and_expires(monkeypatch):
    enrich = AsyncMock(return_value=BookVisuals(dominant_color="#123456"))
    with patch.object(visuals, "_enrich", enrich):
        a, b = await asyncio.gather(visuals.get_visuals(BOOK), visuals.get_visuals(BOOK))
        assert a == b
        assert await visuals.get_visuals(BOOK) == a
        assert enrich.await_count == 1
        key = next(iter(visuals._cache))
        visuals._cache[key] = (0, a)
        await visuals.get_visuals(BOOK)
        assert enrich.await_count == 2
        monkeypatch.setattr(visuals, "MAX_CACHE_ITEMS", 1)
        await visuals.get_visuals(BOOK.model_copy(update={"id": "b"}))
        assert len(visuals._cache) == 1


async def test_unavailable_art_preserves_cover_color():
    with (
        patch.object(visuals, "download_cover", AsyncMock(return_value=png((180, 70, 40, 255)))),
        patch.object(visuals, "find_artwork", AsyncMock(side_effect=httpx.ReadTimeout("timeout"))),
    ):
        result = await visuals.get_visuals(
            BOOK.model_copy(update={"cover_url": "https://covers.openlibrary.org/a.jpg"})
        )
    assert result.dominant_color == "#b44628"
    assert result.artwork is None


async def test_deadline_returns_partial_result(monkeypatch):
    async def slow_art(*_args):
        await asyncio.sleep(1)

    monkeypatch.setattr(visuals, "VISUAL_DEADLINE_SECONDS", 0.01)
    with patch.object(visuals, "find_artwork", side_effect=slow_art):
        assert await visuals.get_visuals(BOOK) == BookVisuals()


def test_visual_route_and_validation(client):
    with patch("hon.routers.books.get_visuals", AsyncMock(return_value=BookVisuals())):
        response = client.post("/books/visuals", json=BOOK.model_dump())
        assert response.status_code == 200
        assert response.json() == {"dominant_color": None, "artwork": None}
        assert client.post("/books/visuals", json={"id": "", "title": ""}).status_code == 422
