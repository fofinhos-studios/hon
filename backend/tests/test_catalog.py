from unittest.mock import patch

import httpx
import pytest

from hon.models.book import BookResult
from hon.services import bookinfo, open_library
from hon.services.catalog import isbn_value, rank_books, relevance
from tests.conftest import async_client, response

ISBN = "9786588490365"


def book(title="Antes que o café esfrie", **kwargs):
    values = dict(
        id="a", title=title, author="Toshikazu Kawaguchi", page_count=208, cover_url=None, language="pt", isbn=ISBN
    )
    values.update(kwargs)
    return BookResult.model_validate(values)


def test_ranking_ignores_accents_case_and_supports_typos():
    exact = book()
    sequel = book("Antes que o café esfrie 2", id="b", isbn=None)
    box = book("Box Série Antes que o Café Esfrie", id="box", isbn=None)
    assert relevance("ANTES QUE O CAFE ESFRIE", exact) == 1
    assert rank_books("Antes que o caff esfrie", [box, sequel, exact])[0] == exact
    assert rank_books("Completely unrelated title", [exact]) == []


def test_author_search_keeps_editions_in_every_language():
    editions = [
        book(),
        book("Before the Coffee Gets Cold", id="en", isbn=None, language="en"),
        book("Antes de que se enfrie el cafe", id="es", isbn=None, language="es"),
        book("コーヒーが冷めないうちに", id="ja", isbn=None, language="ja"),
    ]
    assert {b.id for b in rank_books("Toshikazu Kawaguchi", editions)} == {b.id for b in editions}


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("antes que o cafe esfrie", "pt"),
        ("Antes que o caff esfrie", "pt"),
        ("before the coffe gets cold", "en"),
        ("Before the Coffee Gets Cold", "en"),
        ("antes de que se enfrie el cafe", "es"),
    ],
)
def test_written_title_decides_ranking_without_language_input(query, expected):
    editions = [
        book(id="pt"),
        book("Before the Coffee Gets Cold", id="en", isbn=None, language="en"),
        book("Antes de que se enfríe el café", id="es", isbn=None, language="es"),
    ]
    assert rank_books(query, editions)[0].id == expected


def test_exact_isbn_overrides_title_and_regional_ties():
    english = book("Katabasis", id="en", isbn="9780063021471", language="en")
    translated = book("Katábasis", id="pt", isbn="9788551012239")
    assert rank_books("978-0-06-302147-1", [translated, english]) == [english]


def test_merges_only_matching_isbn_and_keeps_better_metadata():
    first = book(author="Unknown", page_count=None)
    second = book(id="provider2", cover_url="https://covers.openlibrary.org/cover.jpg")
    edition = book(id="edition2", isbn="9788558891523")
    results = rank_books("antes que o cafe esfrie", [first, second, edition])
    assert len(results) == 2
    merged = next(b for b in results if b.isbn == ISBN)
    assert merged.page_count == 208
    assert merged.author == second.author
    assert merged.cover_url == second.cover_url


def test_isbn_validation_and_conversion():
    assert isbn_value("978-65-88490-36-5") == ISBN
    assert isbn_value("8551012231") == "9788551012239"
    assert isbn_value("9786588490360") is None


def test_bookinfo_parses_publisher_cover_and_author_without_translator():
    result = bookinfo.normalize(
        {
            "isbn": ISBN,
            "titulo": "Antes que o café esfrie",
            "idioma": "Português",
            "medidas": {"paginas": "208"},
            "editora": {"nome_fantasia": "Valentina"},
            "imagens": {"imagem_primeira_capa": {"grande": "https://fl-storage.bookinfometadados.com.br/cover.jpg"}},
            "contribuicao": [
                {"codigo_contribuicao": "1", "nome": "Toshikazu", "sobrenome": "Kawaguchi"},
                {"codigo_contribuicao": "9", "nome": "Translator"},
            ],
        }
    )
    assert result is not None
    assert result.author == "Toshikazu Kawaguchi"
    assert result.page_count == 208 and result.language == "pt"
    assert result.cover_url == "https://fl-storage.bookinfometadados.com.br/cover.jpg"
    assert bookinfo.normalize({"titulo": "No ISBN"}) is None


@pytest.mark.asyncio
async def test_bookinfo_broadens_failed_exact_search_for_typo():
    client = async_client()
    client.get.side_effect = lambda _url, *, params: response(
        {"books": [{"isbn": ISBN, "titulo": "Antes que o café esfrie"}]}
        if params["titulo"] == "esfrie"
        else {"books": []}
    )
    with patch("hon.services.bookinfo.httpx.AsyncClient", return_value=client):
        results = await bookinfo.search("Antes que o caff esfrie")
    assert results[0].title == "Antes que o café esfrie"
    assert client.get.call_args_list[1].kwargs["params"]["titulo"] == "esfrie"


def test_open_library_uses_edition_not_original_work():
    result = open_library.normalize(
        {
            "key": "/works/1",
            "title": "Before the Coffee Gets Cold",
            "cover_i": 999,
            "number_of_pages_median": 999,
            "author_name": ["Toshikazu Kawaguchi"],
            "editions": {
                "docs": [
                    {
                        "key": "/books/OL123M",
                        "title": "Antes que o café esfrie",
                        "cover_i": 123,
                        "isbn": [ISBN],
                        "language": ["por"],
                        "publisher": ["Valentina"],
                    }
                ]
            },
        }
    )
    assert result is not None
    assert result.title == "Antes que o café esfrie" and result.id == "OL123M"
    assert result.cover_url is not None and "/123-L.jpg" in result.cover_url
    assert result.page_count is None  # Never substitute the work median for an edition.


@pytest.mark.asyncio
async def test_open_library_fuzzy_retry_includes_unrestricted_results():
    client = async_client(
        {"docs": []}, {"docs": []}, {"docs": [{"key": "/works/OL1W", "title": "Katábasis"}]}, {"docs": []}
    )
    with patch("hon.services.open_library.httpx.AsyncClient", return_value=client):
        results = await open_library.search("katabasis")
    assert results[0].title == "Katábasis"
    assert client.get.call_args_list[2].kwargs["params"]["q"] == "katabasis~1"


@pytest.mark.asyncio
async def test_missing_edition_pages_survive_hydration_timeout():
    client = async_client()
    client.get.side_effect = [
        response({"docs": [{"key": "/books/OL123M", "title": "Katábasis"}]}),
        response({"docs": []}),
        httpx.ReadTimeout("timeout"),
    ]
    with patch("hon.services.open_library.httpx.AsyncClient", return_value=client):
        results = await open_library.search("Katabasis")
    assert results[0].page_count is None
