import { useEffect, useRef, useState } from "preact/hooks";
import {
  BookSearchResults,
  SeriesSearchResults,
  groupSearchResults,
} from "../features/books/book-search-results";
import { BookSearchStatus } from "../features/books/book-search-status";
import { useBookSearch } from "../features/books/use-book-search";
import { useLanguage } from "../i18n";
import {
  searchBooks as defaultSearchBooks,
  searchSeries as defaultSearchSeries,
  getBookVisuals,
  prefetchBookVisuals,
} from "../services/api";
import type { Book, SearchBook } from "../types";
import { Icon } from "./icon";

interface Props {
  onAdd: (book: Book) => void;
  onAddBooks: (books: Book[]) => void;
  searchBooks?: typeof defaultSearchBooks;
  searchSeries?: typeof defaultSearchSeries;
}

export function BookSearch({
  onAdd,
  onAddBooks,
  searchBooks = defaultSearchBooks,
  searchSeries = defaultSearchSeries,
}: Props) {
  const { copy } = useLanguage();
  const search = useBookSearch(searchBooks, searchSeries);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualPages, setManualPages] = useState("");
  const [manualKind, setManualKind] = useState<"page" | "audiobook">("page");
  const [pendingBook, setPendingBook] = useState<SearchBook | null>(null);
  const [pendingEditions, setPendingEditions] = useState<SearchBook[]>([]);
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

  const toSavedBook = (book: SearchBook): Book | null => {
    const { source: _source, work_key: _workKey, ...edition } = book;
    const id = edition.id.startsWith(`${book.source}:`)
      ? edition.id
      : `${book.source}:${edition.id}`;
    if (edition.kind === "page") {
      if (
        !edition.page_count ||
        !Number.isSafeInteger(edition.page_count) ||
        edition.page_count < 1
      )
        return null;
      return { ...edition, id, page_count: edition.page_count };
    }
    const durationMinutes = edition.duration_minutes;
    if (
      durationMinutes === null ||
      !Number.isSafeInteger(durationMinutes) ||
      durationMinutes < 1
    )
      return null;
    return { ...edition, id, duration_minutes: durationMinutes };
  };

  const handleAdd = async (book: SearchBook, editions: SearchBook[]) => {
    const quantity =
      book.kind === "page" ? book.page_count : book.duration_minutes;
    if (!quantity || !Number.isSafeInteger(quantity) || quantity < 1) {
      setPendingBook(book);
      setPendingEditions(editions);
      setEditionPages("");
      return;
    }
    const visuals = await getBookVisuals(book).catch(() => undefined);
    const saved = toSavedBook(book);
    if (saved) {
      const validEditions = editions
        .map((edition) =>
          edition.source === book.source && edition.id === book.id
            ? book
            : edition,
        )
        .filter((edition) => toSavedBook(edition) !== null);
      onAdd({
        ...saved,
        ...(validEditions.length > 1
          ? { available_editions: validEditions }
          : {}),
        ...(visuals ? { visuals, visuals_checked_at: Date.now() } : {}),
      });
    }
    setPendingBook(null);
    setPendingEditions([]);
    search.reset();
    searchInput.current?.focus();
  };

  const handleAddSeries = (books: Extract<SearchBook, { kind: "page" }>[]) => {
    const saved = books
      .map(toSavedBook)
      .filter((book): book is Book => book !== null);
    if (saved.length > 0) onAddBooks(saved);
  };

  const handleManualSubmit = (event: Event) => {
    event.preventDefault();
    const title = manualTitle.trim();
    if (!canAddManual) return;

    const base = {
      id: `manual-${Date.now()}-${crypto.randomUUID()}`,
      title,
      author: "Manual entry",
      cover_url: null,
    };
    onAdd(
      manualKind === "page"
        ? {
            ...base,
            kind: "page",
            format: "unspecified",
            page_count: manualPageCount,
          }
        : {
            ...base,
            kind: "audiobook",
            duration_minutes: manualPageCount,
            narrators: [],
          },
    );
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
          {search.mode === "books"
            ? copy.search.title
            : copy.search.seriesTitle}
        </p>
        <fieldset
          class="book-search__categories"
          aria-label={copy.search.category}
        >
          {(
            [
              ["books", copy.search.booksCategory],
              ["series", copy.search.seriesCategory],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              class="book-search__category"
              aria-pressed={search.mode === mode}
              onClick={() => {
                if (search.mode === mode) return;
                setManualOpen(false);
                setPendingBook(null);
                setPendingEditions([]);
                setEditionPages("");
                search.setMode(mode);
              }}
            >
              {label}
            </button>
          ))}
        </fieldset>
        {search.mode === "books" && (
          <fieldset
            class="book-search__filters"
            aria-label={copy.search.filterEdition}
          >
            <legend class="book-search__filter-label hon-mono">
              {copy.search.filterEdition}
            </legend>
            <div class="book-search__filter-options">
              {(
                [
                  [null, copy.search.allFormats],
                  ["physical", copy.books.physical],
                  ["digital", copy.books.digital],
                  ["unspecified", copy.search.unspecified],
                  ["audiobook", copy.books.audiobook],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value ?? "all"}
                  type="button"
                  class="book-search__filter"
                  aria-pressed={search.editionType === value}
                  onClick={() => search.setEditionType(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        )}
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
              placeholder={
                search.mode === "books"
                  ? copy.search.placeholder
                  : copy.search.seriesPlaceholder
              }
              value={search.query}
              onInput={(e) =>
                search.setQuery((e.target as HTMLInputElement).value)
              }
              aria-label={
                search.mode === "books"
                  ? copy.search.label
                  : copy.search.seriesLabel
              }
              aria-busy={search.loading}
              aria-autocomplete="list"
              aria-controls={
                search.mode === "books"
                  ? search.results.length > 0
                    ? "book-search-results"
                    : undefined
                  : search.series.length > 0
                    ? "book-series-results"
                    : undefined
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
          {search.mode === "books" && (
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
          )}
        </div>

        {search.mode === "books" && manualOpen && (
          <form
            id="book-manual-form"
            class="book-search__manual"
            onSubmit={handleManualSubmit}
            aria-label={copy.search.manualForm}
          >
            <div class="book-search__manual-grid">
              <select
                class="hon-input"
                aria-label={copy.search.format}
                value={manualKind}
                onChange={(event) =>
                  setManualKind(
                    event.currentTarget.value as "page" | "audiobook",
                  )
                }
              >
                <option value="page">{copy.search.pageBook}</option>
                <option value="audiobook">{copy.search.audiobook}</option>
              </select>
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
                placeholder={
                  manualKind === "page"
                    ? copy.search.pages
                    : copy.search.duration
                }
                value={manualPages}
                onInput={(e) =>
                  setManualPages((e.target as HTMLInputElement).value)
                }
                aria-label={
                  manualKind === "page"
                    ? copy.search.numberOfPages
                    : copy.search.duration
                }
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
          key={`${search.mode}:${search.query}:${search.editionType ?? "all"}`}
          loading={search.loading}
          error={search.error}
          errorCode={search.errorCode}
          resultCount={
            search.mode === "books"
              ? groupSearchResults(search.results).length
              : search.series.length
          }
        />
        {search.mode === "series" ? (
          <SeriesSearchResults
            series={search.series}
            query={search.query}
            onAddSeries={handleAddSeries}
          />
        ) : (
          <BookSearchResults results={search.results} onSelect={handleAdd} />
        )}
        {search.partial && (
          <p class="book-search__status">{copy.search.partial}</p>
        )}
        {search.searched &&
          (search.mode === "books"
            ? search.results.length === 0
            : search.series.length === 0) &&
          !search.partial &&
          !search.error && (
            <p class="book-search__status" aria-live="polite">
              {search.mode === "books"
                ? copy.search.noResults
                : copy.search.noSeriesResults}
            </p>
          )}
        {search.mode === "books" && pendingBook && (
          <form
            class="book-search__edition"
            onSubmit={(event) => {
              event.preventDefault();
              const quantity = Number(editionPages);
              if (!Number.isSafeInteger(quantity) || quantity < 1) return;
              handleAdd(
                pendingBook.kind === "page"
                  ? { ...pendingBook, page_count: quantity }
                  : { ...pendingBook, duration_minutes: quantity },
                pendingEditions,
              );
            }}
          >
            <p>
              {pendingBook.kind === "page"
                ? copy.search.enterPages(pendingBook.title)
                : copy.search.enterDuration(pendingBook.title)}
            </p>
            <label>
              {pendingBook.kind === "page"
                ? copy.search.pages
                : copy.search.duration}
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
                setPendingEditions([]);
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
