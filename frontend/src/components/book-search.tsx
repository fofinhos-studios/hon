import { Plus, Search } from "lucide-preact";
import { useState } from "preact/hooks";
import { BookSearchResults } from "../features/books/book-search-results";
import { BookSearchStatus } from "../features/books/book-search-status";
import { useBookSearch } from "../features/books/use-book-search";
import { searchBooks as defaultSearchBooks } from "../services/api";
import type { Book } from "../types";

interface Props {
  onAdd: (book: Book) => void;
  searchBooks?: typeof defaultSearchBooks;
}

export function BookSearch({ onAdd, searchBooks = defaultSearchBooks }: Props) {
  const search = useBookSearch(searchBooks);
  const [manualTitle, setManualTitle] = useState("");
  const [manualPages, setManualPages] = useState("");
  const manualPageCount = Number.parseInt(manualPages, 10);
  const canAddManual =
    manualTitle.trim().length > 0 &&
    Number.isFinite(manualPageCount) &&
    manualPageCount > 0;

  const handleAdd = (book: Book) => {
    onAdd(book);
    search.reset();
  };

  const handleManualSubmit = (event: Event) => {
    event.preventDefault();
    const title = manualTitle.trim();
    if (!canAddManual) return;

    onAdd({
      id: `manual-${Date.now()}-${crypto.randomUUID()}`,
      title,
      author: "Manual entry",
      page_count: manualPageCount,
      cover_url: null,
    });
    setManualTitle("");
    setManualPages("");
  };

  return (
    <div class="book-search" aria-busy={search.loading ? "true" : "false"}>
      <section class="book-search__section" aria-labelledby="book-search-title">
        <p class="book-search__subtitle hon-mono" id="book-search-title">
          Add book via search
        </p>
        <div class="book-search__input-wrap">
          <Search class="book-search__icon" size={16} aria-hidden="true" />
          <input
            class="hon-input book-search__input"
            type="search"
            placeholder="Search books…"
            value={search.query}
            onInput={(e) =>
              search.setQuery((e.target as HTMLInputElement).value)
            }
            aria-label="Search books"
            aria-autocomplete="list"
            aria-controls="book-search-results"
          />
        </div>

        <BookSearchStatus
          loading={search.loading}
          error={search.error}
          resultCount={search.results.length}
        />
        <BookSearchResults
          results={search.results}
          usingFallback={search.usingFallback}
          onSelect={handleAdd}
        />
      </section>

      <div class="book-search__separator" aria-hidden="true">
        <span>or</span>
      </div>

      <form
        class="book-search__manual book-search__section"
        onSubmit={handleManualSubmit}
        aria-labelledby="book-manual-title"
      >
        <p class="book-search__subtitle hon-mono" id="book-manual-title">
          Add book manually
        </p>
        <div class="book-search__manual-grid">
          <input
            class="hon-input"
            type="text"
            placeholder="Book name"
            value={manualTitle}
            onInput={(e) =>
              setManualTitle((e.target as HTMLInputElement).value)
            }
            aria-label="Book name"
          />
          <input
            class="hon-input book-search__manual-pages"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            placeholder="Pages"
            value={manualPages}
            onInput={(e) =>
              setManualPages((e.target as HTMLInputElement).value)
            }
            aria-label="Number of pages"
          />
        </div>
        <button
          class="hon-btn hon-btn--accent book-search__manual-submit"
          type="submit"
          disabled={!canAddManual}
        >
          <Plus size={14} aria-hidden="true" />
          <span>Add manual book</span>
        </button>
      </form>
    </div>
  );
}
