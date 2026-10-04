import { useEffect, useRef, useState } from "preact/hooks";
import { BookSearchResults } from "../features/books/book-search-results";
import { BookSearchStatus } from "../features/books/book-search-status";
import { useBookSearch } from "../features/books/use-book-search";
import { useLanguage } from "../i18n";
import {
  getBookVisuals,
  prefetchBookVisuals,
  searchBooks as defaultSearchBooks,
} from "../services/api";
import type { Book, SearchBook } from "../types";
import { Icon } from "./icon";

interface Props {
  onAdd: (book: Book) => void;
  searchBooks?: typeof defaultSearchBooks;
}

export function BookSearch({ onAdd, searchBooks = defaultSearchBooks }: Props) {
  const { copy } = useLanguage();
  const search = useBookSearch(searchBooks);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualPages, setManualPages] = useState("");
  const [pendingBook, setPendingBook] = useState<SearchBook | null>(null);
  const [editionPages, setEditionPages] = useState("");
  const editionInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const manualInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (pendingBook) editionInput.current?.focus();
  }, [pendingBook]);
  useEffect(() => {
    if (manualOpen) manualInput.current?.focus();
  }, [manualOpen]);
  useEffect(() => {
    for (const book of search.results) prefetchBookVisuals(book);
  }, [search.results]);
  const manualPageCount = Number(manualPages);
  const canAddManual =
    manualTitle.trim().length > 0 &&
    Number.isSafeInteger(manualPageCount) &&
    manualPageCount > 0;

  const handleAdd = async (book: SearchBook) => {
    if (!book.page_count) {
      setPendingBook(book);
      setEditionPages("");
      search.reset();
      return;
    }
    const visuals = await getBookVisuals(book).catch(() => undefined);
    onAdd({
      ...book,
      page_count: book.page_count,
      ...(visuals
        ? { visuals, visuals_checked_at: Date.now() }
        : {}),
    });
    setPendingBook(null);
    search.reset();
    searchInput.current?.focus();
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
    setManualOpen(false);
    search.reset();
    searchInput.current?.focus();
  };

  return (
    <div class="book-search">
      <section class="book-search__section" aria-labelledby="book-search-title">
        <p class="book-search__subtitle hon-mono" id="book-search-title">
          {copy.search.title}
        </p>
        <div class="book-search__entry-row">
          <div class="book-search__input-wrap">
            <Icon
              name="search"
              class="book-search__icon"
              size={16}
              aria-hidden="true"
            />
            <input
              class="hon-input book-search__input"
              ref={searchInput}
              type="search"
              placeholder={copy.search.placeholder}
              value={search.query}
              onInput={(e) =>
                search.setQuery((e.target as HTMLInputElement).value)
              }
              aria-label={copy.search.label}
              aria-busy={search.loading}
              aria-autocomplete="list"
              aria-controls={
                search.results.length > 0 ? "book-search-results" : undefined
              }
            />
            {search.loading ? (
              <span class="book-search__input-action" aria-hidden="true">
                <Icon name="spinner" class="hon-spin" size={20} />
              </span>
            ) : search.query ? (
              <button
                type="button"
                class="hon-icon-button book-search__input-action"
                aria-label={copy.search.clear}
                onClick={() => {
                  search.reset();
                  searchInput.current?.focus();
                }}
              >
                <Icon name="x" size={20} />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            class="hon-btn book-search__manual-toggle"
            aria-label={copy.search.addManually}
            aria-expanded={manualOpen}
            aria-controls={manualOpen ? "book-manual-form" : undefined}
            onClick={() => {
              if (!manualOpen) setManualTitle(search.query);
              setManualOpen((value) => !value);
            }}
          >
            <Icon name="plus" size={16} />
            <span>{copy.search.addManually}</span>
          </button>
        </div>

        {manualOpen && (
          <form
            id="book-manual-form"
            class="book-search__manual"
            onSubmit={handleManualSubmit}
            aria-label={copy.search.manualForm}
          >
            <div class="book-search__manual-grid">
              <input
                class="hon-input"
                ref={manualInput}
                type="text"
                placeholder={copy.search.bookName}
                value={manualTitle}
                onInput={(e) =>
                  setManualTitle((e.target as HTMLInputElement).value)
                }
                aria-label={copy.search.bookName}
              />
              <input
                class="hon-input book-search__manual-pages"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                placeholder={copy.search.pages}
                value={manualPages}
                onInput={(e) =>
                  setManualPages((e.target as HTMLInputElement).value)
                }
                aria-label={copy.search.numberOfPages}
              />
              <button
                class="hon-btn hon-btn--accent book-search__manual-submit"
                type="submit"
                disabled={!canAddManual}
              >
                <Icon name="plus" size={14} aria-hidden="true" />
                <span>{copy.search.addBook}</span>
              </button>
              <button
                class="hon-btn"
                type="button"
                onClick={() => {
                  setManualOpen(false);
                  searchInput.current?.focus();
                }}
              >
                {copy.search.cancel}
              </button>
            </div>
          </form>
        )}

        <BookSearchStatus
          key={search.query}
          loading={search.loading}
          error={search.error}
          errorCode={search.errorCode}
          resultCount={search.results.length}
        />
        <BookSearchResults results={search.results} onSelect={handleAdd} />
        {search.partial && (
          <p class="book-search__status">{copy.search.partial}</p>
        )}
        {search.searched && search.results.length === 0 && !search.error && (
          <p class="book-search__status" aria-live="polite">
            {copy.search.noResults}
          </p>
        )}
        {pendingBook && (
          <form
            class="book-search__edition"
            onSubmit={(event) => {
              event.preventDefault();
              const pages = Number(editionPages);
              if (!Number.isSafeInteger(pages) || pages < 1) return;
              handleAdd({ ...pendingBook, page_count: pages });
            }}
          >
            <p>{copy.search.enterPages(pendingBook.title)}</p>
            <label>
              {copy.search.pages}
              <input
                class="hon-input"
                ref={editionInput}
                type="number"
                min={1}
                step={1}
                required
                value={editionPages}
                onInput={(event) => setEditionPages(event.currentTarget.value)}
              />
            </label>
            <button type="submit" class="hon-btn hon-btn--accent">
              {copy.search.addEdition}
            </button>
            <button
              type="button"
              class="hon-btn"
              onClick={() => {
                setPendingBook(null);
                searchInput.current?.focus();
              }}
            >
              {copy.search.cancel}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
