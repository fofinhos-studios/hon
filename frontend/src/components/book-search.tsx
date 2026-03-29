import { Search } from "lucide-preact";
import { useCallback, useRef, useState } from "preact/hooks";
import { searchBooks } from "../services/api";
import type { Book } from "../types";

interface Props {
  onAdd: (book: Book) => void;
}

export function BookSearch({ onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInput = useCallback(
    (value: string) => {
      setQuery(value);
      setError("");

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (value.trim().length < 2) {
        setResults([]);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const books = await searchBooks(value.trim());
          setResults(books);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Search failed");
          setResults([]);
        } finally {
          setLoading(false);
        }
      }, 350);
    },
    [],
  );

  const handleAdd = (book: Book) => {
    onAdd(book);
    setQuery("");
    setResults([]);
  };

  return (
    <div class="book-search">
      <div class="book-search__input-wrap">
        <Search class="book-search__icon" size={16} aria-hidden="true" />
        <input
          class="hon-input book-search__input"
          type="search"
          placeholder="Search books…"
          value={query}
          onInput={(e) => handleInput((e.target as HTMLInputElement).value)}
          aria-label="Search books"
          aria-autocomplete="list"
          aria-controls="book-search-results"
        />
      </div>

      {loading && (
        <p class="book-search__status hon-mono" aria-live="polite">
          Searching…
        </p>
      )}
      {error && (
        <p class="book-search__error" role="alert">
          {error}
        </p>
      )}

      {results.length > 0 && (
        <ul class="book-search__results" id="book-search-results" role="listbox">
          {results.map((book) => (
            <li key={book.id} role="option" aria-selected="false">
              <button
                type="button"
                class="book-search__result"
                onClick={() => handleAdd(book)}
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
      )}
    </div>
  );
}
