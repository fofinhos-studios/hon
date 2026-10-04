import { useLanguage } from "../../i18n";
import type { SearchBook } from "../../types";
import { BookCover } from "./book-art";

interface Props {
  results: SearchBook[];
  onSelect: (book: SearchBook) => void;
}

export function BookSearchResults({ results, onSelect }: Props) {
  const { copy, languageName, number } = useLanguage();
  if (results.length === 0) return null;
  return (
    <ul class="book-search__results" id="book-search-results">
      {results.map((book, index) => (
        <li key={book.id} class="book-search__result-item">
          <button
            type="button"
            class="book-search__result"
            onClick={() => onSelect(book)}
          >
            <BookCover
              book={book}
              priority={
                index === 0 ? "high" : index === 1 ? "eager" : undefined
              }
            />
            <span class="book-search__result-info">
              <span class="book-search__result-title">{book.title}</span>
              <span class="book-search__result-meta">{book.author}</span>
              <span class="book-search__result-meta">
                {[
                  book.language ? languageName(book.language) : null,
                  book.publisher,
                  book.published_date,
                  book.page_count
                    ? copy.books.pageCount(number(book.page_count))
                    : copy.search.pagesNotListed,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {book.isbn && (
                <span class="book-search__result-meta hon-mono">
                  ISBN {book.isbn}
                </span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
