"""Brazilian edition metadata and publisher-supplied covers from Bookinfo."""

import asyncio
from contextlib import suppress

import httpx

from hon.models.book import BookResult
from hon.services.catalog import folded, isbn_value, relevance, search_terms
from hon.services.http import decode_json_object
from hon.services.normalization import non_empty_string, positive_page_count

BOOKINFO_URL = "https://api.bookinfometadados.com.br/api/v1.2/book"
LANGUAGES = {"portugues": "pt", "ingles": "en", "espanhol": "es", "frances": "fr", "alemao": "de"}


def normalize(item: dict) -> BookResult | None:
    isbn = isbn_value(str(item.get("isbn", "")))
    title = non_empty_string(item.get("titulo"))
    if not isbn or not title:
        return None
    contributors = item.get("contribuicao")
    authors = (
        [
            " ".join(str(person.get(key) or "").strip() for key in ("nome", "sobrenome")).strip()
            for person in contributors
            if isinstance(person, dict)
            and (str(person.get("codigo_contribuicao")) == "1" or person.get("tipo_de_contribuicao") == "Autor")
        ]
        if isinstance(contributors, list)
        else []
    )
    measures = item.get("medidas")
    raw_pages = measures.get("paginas") if isinstance(measures, dict) else None
    pages = int(raw_pages) if isinstance(raw_pages, str) and raw_pages.isdecimal() else raw_pages
    images = item.get("imagens")
    cover = images.get("imagem_primeira_capa") if isinstance(images, dict) else None
    url = non_empty_string(cover.get("grande") or cover.get("media")) if isinstance(cover, dict) else None
    publisher = item.get("editora")
    return BookResult(
        source="bookinfo",
        id=f"isbn:{isbn}",
        title=title,
        author=", ".join(filter(None, authors)) or "Unknown",
        isbn=isbn,
        page_count=positive_page_count(pages),
        cover_url=url,
        cover_fallback_url=f"https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg?default=false",
        language=LANGUAGES.get(folded(str(item.get("idioma", "")))),
        publisher=non_empty_string(publisher.get("nome_fantasia")) if isinstance(publisher, dict) else None,
        published_date=non_empty_string(item.get("ano_edicao")),
    )


async def search(query: str) -> list[BookResult]:
    async with httpx.AsyncClient(timeout=4.0) as client:

        async def lookup(term: str, field: str = "titulo") -> list[BookResult]:
            response = await client.get(BOOKINFO_URL, params={field: term, "limit": 100})
            response.raise_for_status()
            data = decode_json_object(response, "Bookinfo")
            return [
                book
                for item in data.get("books") or []
                if isinstance(item, dict) and (book := normalize(item)) is not None
            ]

        isbn = isbn_value(query)
        if isbn:
            return await lookup(isbn, "isbn")
        books = await lookup(folded(query))
        if not any(relevance(query, book) >= 0.85 for book in books):
            # Bounded broader retrieval makes local fuzzy ranking useful for typos.
            terms = sorted(search_terms(query), key=lambda term: len(term), reverse=True)
            if not terms:
                return books
            term = terms[0] if len(terms) > 1 else terms[0][:4]
            if term != folded(query):
                with suppress(httpx.HTTPError):
                    books.extend(await lookup(term))
            if not any(relevance(query, book) >= 0.85 for book in books):
                # Bookinfo's title endpoint is substring-based, so query trigrams
                # of the two longest words to retrieve nearby spellings.
                fragments = dict.fromkeys(
                    term[index : index + 3] for term in terms[:2] if len(term) >= 6 for index in range(len(term) - 2)
                )
                if not fragments:
                    return books
                results = await asyncio.gather(*(lookup(fragment) for fragment in fragments), return_exceptions=True)
                for result in results:
                    if isinstance(result, httpx.HTTPError):
                        continue
                    if isinstance(result, BaseException):
                        raise result
                    books.extend(result)
        return books
