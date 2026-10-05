from unittest.mock import patch

import httpx
import pytest

from hon.services.audiosilo import normalize, search


def test_normalize_recording_keeps_facts_without_retailer_artwork():
    book = normalize(
        {"id": "w1", "title": "Dune", "authors": [{"name": "Frank Herbert"}], "language": "en"},
        {
            "id": "r1",
            "runtime_min": 342,
            "narrators": [{"name": "Reader One"}],
            "isbn": ["9780441172719"],
            "cover_url": "https://retailer.example/cover.jpg",
        },
    )
    assert book is not None
    assert book.id == "audiosilo:w1:r1"
    assert book.kind == "audiobook"
    assert book.duration_minutes == 342
    assert book.narrators == ["Reader One"]
    assert book.cover_url is None


def test_normalize_missing_runtime_allows_manual_duration():
    book = normalize({"id": "w1", "title": "Dune"}, {"id": "r1", "runtime_min": None})
    assert book is not None
    assert book.duration_minutes is None


@pytest.mark.asyncio
async def test_search_keeps_available_recording_when_a_work_detail_fails():
    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/works/search"):
            return httpx.Response(200, json={"results": [{"id": "w1"}, {"id": "w2"}]})
        if request.url.path.endswith("/works/w1"):
            return httpx.Response(
                200, json={"id": "w1", "title": "Dune", "recordings": [{"id": "r1", "runtime_min": 300}]}
            )
        return httpx.Response(503)

    transport = httpx.MockTransport(respond)
    original = httpx.AsyncClient

    def client(*args, **kwargs):
        return original(*args, transport=transport, **kwargs)

    with patch("hon.services.audiosilo.httpx.AsyncClient", side_effect=client):
        books = await search("dune")
    assert len(books) == 1
    assert books[0].duration_minutes == 300
