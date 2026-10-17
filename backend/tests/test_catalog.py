from unittest.mock import patch

import httpx
import pytest

from hon.models.book import AudiobookResult, BookResult, SeriesMembership
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


def test_babel_editions_rank_together_ahead_of_older_same_title_authors():
    portuguese = book(
        "Babel", id="kuang-pt", author="R. F. Kuang", language="pt",
        isbn="9786555607345", page_count=544, popularity=None, published_date="2023",
    )
    english = book(
        "Babel", id="kuang-en", author="R.F. Kuang", language="en",
        isbn="9780063021426", page_count=None, popularity=1800, published_date="2022",
    )
    paperback = book(
        "Babel", id="kuang-paperback", author="R. F. Kuang", language="en",
        isbn="9780063021433", format="physical", page_count=None,
    )
    old = book(
        "Babel", id="old", author="Another Author", language="en",
        isbn="9780063021440", page_count=650, popularity=4,
        cover_url="https://covers.test/old", published_date="2025",
    )
    other = book(
        "Babel", id="other", author="A Different Author", language="en",
        isbn="9780063021457", page_count=420, published_date="2024",
    )
    ranked = rank_books("Babel", [old, english, other, portuguese, paperback], limit=None)
    assert {item.id for item in ranked[:3]} == {"kuang-pt", "kuang-en", "kuang-paperback"}
    assert {item.id for item in ranked[3:]} == {"old", "other"}
    assert {item.language for item in ranked[:3]} == {"en", "pt"}


def test_popularity_never_overrides_stronger_title_or_exact_isbn():
    exact = book("Babel", id="exact", isbn="9780063021426", popularity=None)
    sequel = book("Babel: A Sequel", id="sequel", isbn="9780063021433", popularity=100000)
    assert rank_books("Babel", [sequel, exact])[0].id == "exact"
    assert rank_books("9780063021426", [sequel, exact]) == [exact]
    assert rank_books("Babl", [sequel, exact])[0].id == "exact"


def test_popularity_is_validated_but_not_exposed_in_edition_response():
    popular = book(popularity=50)
    assert popular.popularity == 50
    assert "popularity" not in popular.model_dump()
    with pytest.raises(ValueError):
        book(popularity=-1)


def test_duplicate_edition_preserves_highest_provider_popularity():
    first = book(id="first", popularity=9)
    second = book(id="second", popularity=400)
    ranked = rank_books("antes que o cafe esfrie", [first, second])
    assert len(ranked) == 1
    assert ranked[0].popularity == 400


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


def test_no_isbn_merges_only_same_publication_and_language():
    first = book(id="google", source="google_books", isbn=None, published_date="2022-01-01", publisher="Publisher")
    duplicate = first.model_copy(update={"id": "library", "source": "open_library", "cover_url": "https://cover.test/a"})
    other_year = first.model_copy(update={"id": "new-year", "published_date": "2023-01-01"})
    other_language = first.model_copy(update={"id": "translation", "language": "en"})
    undated = first.model_copy(update={"id": "undated", "published_date": None})
    ranked = rank_books("antes que o cafe esfrie", [first, duplicate, other_year, other_language, undated])
    assert len(ranked) == 4
    assert next(item for item in ranked if item.id == "google").cover_url == "https://cover.test/a"


def test_no_isbn_missing_date_merges_only_corroborated_publication():
    dated = book(
        id="google", source="google_books", isbn=None, published_date="2022-01-01",
        publisher="Editora Exemplo", format="physical", cover_url=None,
    )
    undated = dated.model_copy(update={
        "id": "library", "source": "open_library", "published_date": None,
        "cover_url": "https://cover.test/edition",
    })
    ranked = rank_books("antes que o cafe esfrie", [undated, dated])
    assert len(ranked) == 1
    assert ranked[0].published_date == "2022-01-01"
    assert ranked[0].cover_url == "https://cover.test/edition"


def test_no_isbn_page_count_corroborates_publication_without_publisher_or_date():
    first = book(id="google", source="google_books", isbn=None, publisher=None, published_date=None)
    second = first.model_copy(update={"id": "library", "source": "open_library"})
    assert len(rank_books("antes que o cafe esfrie", [first, second])) == 1


def test_no_isbn_publisher_and_format_corroborate_publication_without_pages():
    first = book(
        id="google", source="google_books", isbn=None, published_date=None,
        publisher="Editora Exemplo", format="physical", page_count=None,
    )
    second = first.model_copy(update={"id": "library", "source": "open_library"})
    assert len(rank_books("antes que o cafe esfrie", [first, second])) == 1


@pytest.mark.parametrize(
    "different",
    [
        {"page_count": 224},
        {"format": "digital"},
        {"publisher": "Another publisher"},
        {"language": "en"},
        {"author": "Another author"},
        {"published_date": "2023-01-01"},
        {"series": SeriesMembership(id="series", name="Series", position=2)},
    ],
)
def test_no_isbn_different_editions_remain_distinct(different):
    first = book(
        id="google", source="google_books", isbn=None, published_date="2022-01-01",
        publisher="Editora Exemplo", format="physical",
        series={"id": "series", "name": "Series", "position": 1},
    )
    second = first.model_copy(update={"id": "library", "source": "open_library", **different})
    assert len(rank_books("antes que o cafe esfrie", [first, second])) == 2


def test_no_isbn_does_not_merge_without_corroborating_metadata():
    first = book(id="google", source="google_books", isbn=None, page_count=None, published_date=None)
    second = first.model_copy(update={"id": "library", "source": "open_library"})
    assert len(rank_books("antes que o cafe esfrie", [first, second])) == 2


def test_undated_no_isbn_stays_separate_when_two_dated_editions_match():
    first = book(id="2022", source="google_books", isbn=None, published_date="2022", publisher="Editora")
    second = first.model_copy(update={"id": "2023", "published_date": "2023"})
    undated = first.model_copy(update={"id": "undated", "source": "open_library", "published_date": None})
    assert len(rank_books("antes que o cafe esfrie", [undated, first, second])) == 3


def test_isbn_match_cannot_override_conflicting_pages_or_series_position():
    first = book(id="first", series={"id": "series", "name": "Series", "position": 1})
    other_pages = first.model_copy(update={"id": "pages", "page_count": 224})
    other_position = first.model_copy(update={
        "id": "position", "series": SeriesMembership(id="series", name="Series", position=2),
    })
    assert len(rank_books("antes que o cafe esfrie", [first, other_pages, other_position])) == 3


def test_distinct_recordings_are_not_merged_even_with_same_provider_id():
    recording = AudiobookResult(
        id="audio", title="Antes que o café esfrie", author="Toshikazu Kawaguchi",
        duration_minutes=300, narrators=["Narrator A"],
    )
    another = recording.model_copy(update={"narrators": ["Narrator B"]})
    assert len(rank_books("antes que o cafe esfrie", [recording, another])) == 2


def test_empty_metadata_is_excluded_but_known_author_without_pages_is_valid():
    empty = book(id="empty", author="Unknown", isbn=None, page_count=None, cover_url=None,
                 cover_fallback_url="https://fallback.test/cover", publisher=None, published_date=None)
    credited = empty.model_copy(update={"id": "credited", "author": "Toshikazu Kawaguchi"})
    assert rank_books("antes que o cafe esfrie", [empty, credited]) == [credited]


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
        {"docs": []},
        {"docs": []},
        {"docs": [{"key": "/works/OL1W", "title": "Katábasis", "author_name": ["R. F. Kuang"]}]},
        {"docs": []},
    )
    with patch("hon.services.open_library.httpx.AsyncClient", return_value=client):
        results = await open_library.search("katabasis")
    assert results[0].title == "Katábasis"
    assert client.get.call_args_list[2].kwargs["params"]["q"] == "katabasis~1"


@pytest.mark.asyncio
async def test_missing_edition_pages_survive_hydration_timeout():
    client = async_client()
    client.get.side_effect = [
        response({"docs": [{"key": "/books/OL123M", "title": "Katábasis", "author_name": ["R. F. Kuang"]}]}),
        response({"docs": []}),
        httpx.ReadTimeout("timeout"),
    ]
    with patch("hon.services.open_library.httpx.AsyncClient", return_value=client):
        results = await open_library.search("Katabasis")
    assert results[0].page_count is None
