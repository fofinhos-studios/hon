import { Search } from "lucide-preact";
import { BookSearchResults } from "../features/books/book-search-results";
import { BookSearchStatus } from "../features/books/book-search-status";
import { useBookSearch } from "../features/books/use-book-search";
import type { Book } from "../types";

interface Props {
  onAdd: (book: Book) => void;
}

export function BookSearch({ onAdd }: Props) {
  const search = useBookSearch();

  const handleAdd = (book: Book) => {
    onAdd(book);
    search.reset();
  };

  return (
    <div class="book-search" aria-busy={search.loading ? "true" : "false"}>
      <div class="book-search__input-wrap">
        <Search class="book-search__icon" size={16} aria-hidden="true" />
        <input
          class="hon-input book-search__input"
          type="search"
          placeholder="Search books…"
          value={search.query}
          onInput={(e) => search.setQuery((e.target as HTMLInputElement).value)}
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
    </div>
  );
}
