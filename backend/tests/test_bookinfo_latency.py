import asyncio
from unittest.mock import patch

import httpx
import pytest

from hon.services import bookinfo
from tests.conftest import async_client, response

ISBN = "9786588490365"
EDITION = {"isbn": ISBN, "titulo": "Antes que o café esfrie", "idioma": "Português"}


@pytest.mark.asyncio
async def test_exact_title_uses_one_provider_request():
    client = async_client({"books": [EDITION]})
    with patch("hon.services.bookinfo.httpx.AsyncClient", return_value=client):
        results = await bookinfo.search("Antes que o café esfrie")

    assert [result.isbn for result in results] == [ISBN]
    client.get.assert_awaited_once()
    assert client.get.call_args.kwargs["params"]["titulo"] == "antes que o cafe esfrie"


@pytest.mark.asyncio
async def test_isbn_uses_only_exact_isbn_lookup():
    client = async_client({"books": [EDITION]})
    with patch("hon.services.bookinfo.httpx.AsyncClient", return_value=client):
        results = await bookinfo.search("978-65-88490-36-5")

    assert [result.isbn for result in results] == [ISBN]
    client.get.assert_awaited_once()
    assert client.get.call_args.kwargs["params"]["isbn"] == ISBN


@pytest.mark.asyncio
async def test_trigram_fallback_retrieves_typo_from_second_longest_word():
    client = async_client()

    async def lookup(_url, *, params):
        edition = {**EDITION, "titulo": "Alchemist Patient"}
        return response({"books": [edition]} if params["titulo"] == "pat" else {"books": []})

    client.get.side_effect = lookup
    with patch("hon.services.bookinfo.httpx.AsyncClient", return_value=client):
        results = await bookinfo.search("Alchemyst Patient")

    assert [result.isbn for result in results] == [ISBN]
    assert len(client.get.call_args_list) <= 10


@pytest.mark.asyncio
async def test_useful_fragment_stops_before_further_batches():
    client = async_client()

    async def lookup(_url, *, params):
        edition = {**EDITION, "titulo": "The Bibliographical Handbook"}
        return response({"books": [edition]} if params["titulo"] == "bib" else {"books": []})

    client.get.side_effect = lookup
    with patch("hon.services.bookinfo.httpx.AsyncClient", return_value=client):
        results = await bookinfo.search("The Bibliographica Handbook")

    assert [result.isbn for result in results] == [ISBN]
    assert len(client.get.call_args_list) <= 5  # exact + broad + at most one batch


@pytest.mark.asyncio
async def test_useful_fragments_in_same_batch_keep_distinct_publications():
    client = async_client()
    first_finished = asyncio.Event()
    first = {**EDITION, "titulo": "The Bibliographical Handbook"}
    second = {**first, "isbn": "9788551012239"}

    async def lookup(_url, *, params):
        fragment = params["titulo"]
        if fragment == "bib":
            first_finished.set()
            return response({"books": [first]})
        if fragment == "han":
            await first_finished.wait()
            await asyncio.sleep(0)
            return response({"books": [second]})
        return response({"books": []})

    client.get.side_effect = lookup
    with patch("hon.services.bookinfo.httpx.AsyncClient", return_value=client):
        results = await bookinfo.search("The Bibliographica Handbook")

    assert [result.isbn for result in results] == [ISBN, "9788551012239"]
    assert len(client.get.call_args_list) == 5  # exact + broad + one three-fragment batch


@pytest.mark.asyncio
async def test_long_miss_limits_provider_requests():
    client = async_client()
    client.get.side_effect = lambda _url, *, params: response({"books": []})
    with patch("hon.services.bookinfo.httpx.AsyncClient", return_value=client):
        assert await bookinfo.search("extraordinary bibliographical unfindable") == []

    assert len(client.get.call_args_list) == 10  # exact + broad + eight fragments


@pytest.mark.asyncio
async def test_malformed_fallback_response_is_not_treated_as_network_failure():
    client = async_client()

    async def lookup(_url, *, params):
        if params["titulo"] == "ext":
            return response(json_error=ValueError("bad JSON"))
        return response({"books": []})

    client.get.side_effect = lookup
    with (
        patch("hon.services.bookinfo.httpx.AsyncClient", return_value=client),
        pytest.raises(httpx.DecodingError, match="Bookinfo returned invalid JSON"),
    ):
        await bookinfo.search("extraordinary bibliographical unfindable")


@pytest.mark.asyncio
async def test_fallback_ignores_network_errors_and_continues():
    client = async_client()

    async def lookup(_url, *, params):
        if params["titulo"] == "bibliographical":
            raise httpx.ConnectError("unavailable")
        return response({"books": []})

    client.get.side_effect = lookup
    with patch("hon.services.bookinfo.httpx.AsyncClient", return_value=client):
        assert await bookinfo.search("extraordinary bibliographical unfindable") == []
