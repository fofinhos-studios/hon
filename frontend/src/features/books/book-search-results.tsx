import type { SearchBook } from "../../types";
import { BookCover } from "./book-art";

interface Props {
  results: SearchBook[];
  onSelect: (book: SearchBook) => void;
}

const LANGUAGES: Record<string, string> = {
  pt: "Português",
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
};

export function BookSearchResults({ results, onSelect }: Props) {
  if (results.length === 0) return null;
  return (
    <ul class="book-search__results" id="book-search-results">
      {results.map((book) => (
        <li key={book.id} class="book-search__result-item">
          <button
            type="button"
            class="book-search__result"
            onClick={() => onSelect(book)}
          >
            <BookCover book={book} />
            <span class="book-search__result-info">
              <span class="book-search__result-title">{book.title}</span>
              <span class="book-search__result-meta">{book.author}</span>
              <span class="book-search__result-meta">
                {[
                  book.language
                    ? LANGUAGES[book.language] || book.language
                    : null,
                  book.publisher,
                  book.published_date,
                  book.page_count
                    ? `${book.page_count} pp`
                    : "Pages not listed",
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
