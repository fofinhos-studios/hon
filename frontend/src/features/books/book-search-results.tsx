import type { Book } from "../../types";

interface Props {
  results: Book[];
  usingFallback: boolean;
  onSelect: (book: Book) => void;
}

export function BookSearchResults({ results, usingFallback, onSelect }: Props) {
  if (results.length === 0) return null;

  return (
    <>
      <ul
        class="book-search__results book-search__results--visible"
        id="book-search-results"
      >
        {results.map((book, index) => (
          <li
            key={book.id}
            class={`book-search__result-item book-search__result-item--${Math.min(index, 5)}`}
          >
            <button
              type="button"
              class="book-search__result"
              onClick={() => onSelect(book)}
            >
              {book.cover_url && (
                <img
                  class="book-search__cover"
                  src={book.cover_url}
                  alt=""
                  width={32}
                  height={48}
                />
              )}
              <div class="book-search__result-info">
                <span class="book-search__result-title">{book.title}</span>
                <span class="book-search__result-meta hon-mono">
                  {book.author} · {book.page_count}pp
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {usingFallback && (
        <p class="book-search__fallback-note hon-mono">
          Results via OpenLibrary
        </p>
      )}
    </>
  );
}
