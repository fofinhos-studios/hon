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
  const requestIdRef = useRef(0);

  const handleInput = useCallback((value: string) => {
    const trimmed = value.trim();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setQuery(value);
    setError("");

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (trimmed.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const books = await searchBooks(trimmed);
        if (requestId !== requestIdRef.current) return;
        setError("");
        setResults(books);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : "Search failed");
        setResults([]);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }, 350);
  }, []);

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

      <p class="sr-only" aria-live="polite" aria-atomic="true">
        {!loading && results.length > 0
          ? `${results.length} result${results.length === 1 ? "" : "s"} found`
          : ""}
      </p>

      {results.length > 0 && (
        <ul class="book-search__results" id="book-search-results">
          {results.map((book) => (
            <li key={book.id}>
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
