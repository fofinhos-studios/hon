import { useMemo, useState } from "preact/hooks";
import { useLanguage } from "../../i18n";
import type { SearchBook, SearchSeries } from "../../types";
import { BookCover } from "./book-art";

interface Props {
  results: SearchBook[];
  onSelect: (book: SearchBook) => void;
}

export function groupSearchResults(results: SearchBook[]): SearchBook[][] {
  const groups = new Map<string, SearchBook[]>();
  for (const book of results) {
    const key =
      book.work_key ||
      `${book.title.toLowerCase()}|${book.author.toLowerCase()}|${book.language ?? "und"}`;
    const group = groups.get(key) ?? [];
    group.push(book);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function BookSearchResults({ results, onSelect }: Props) {
  const { copy, languageName, number } = useLanguage();
  if (results.length === 0) return null;
  return (
    <ul class="book-search__results" id="book-search-results">
      {groupSearchResults(results).map((editions, groupIndex) => {
        const work = editions[0];
        return (
          <li key={work.work_key || work.id} class="book-search__work">
            <div class="book-search__work-heading">
              <strong>{work.title}</strong>
              <span>{work.author}</span>
              {work.language && <span>{languageName(work.language)}</span>}
            </div>
            <ul class="book-search__editions">
              {editions.map((book, index) => (
                <li
                  key={`${book.source}:${book.id}`}
                  class="book-search__result-item"
                >
                  <button
                    type="button"
                    class="book-search__result"
                    onClick={() => onSelect(book)}
                  >
                    <BookCover
                      book={book}
                      priority={
                        groupIndex === 0 && index === 0 ? "high" : undefined
                      }
                    />
                    <span class="book-search__result-info">
                      <span class="book-search__result-title">
                        {book.kind === "audiobook"
                          ? copy.books.audiobook
                          : book.format === "physical"
                            ? copy.books.physical
                            : book.format === "digital"
                              ? copy.books.digital
                              : copy.books.unspecified}
                      </span>
                      {book.kind === "page" && book.series && (
                        <span class="hon-eyebrow book-search__result-series">
                          {copy.books.seriesPosition(
                            book.series.name,
                            book.series.position,
                          )}
                        </span>
                      )}
                      <span class="book-search__result-meta">
                        {book.kind === "audiobook"
                          ? book.duration_minutes
                            ? copy.books.durationCount(
                                number(book.duration_minutes),
                              )
                            : copy.search.durationNotListed
                          : book.page_count
                            ? copy.books.pageCount(number(book.page_count))
                            : copy.search.pagesNotListed}
                        {book.publisher ? ` · ${book.publisher}` : ""}
                        {book.published_date ? ` · ${book.published_date}` : ""}
                      </span>
                      {book.kind === "audiobook" &&
                        book.narrators.length > 0 && (
                          <span class="book-search__result-meta">
                            {copy.books.narrators(book.narrators.join(", "))}
                          </span>
                        )}
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
          </li>
        );
      })}
    </ul>
  );
}

interface SeriesProps {
  series: SearchSeries[];
  query: string;
  onSelect: (book: SearchBook) => void;
  onAddSeries: (books: Extract<SearchBook, { kind: "page" }>[]) => void;
}

type SeriesBook = Extract<SearchBook, { kind: "page" }>;

function isMainBook(book: SeriesBook): boolean {
  const position = book.series?.position;
  return position != null && position > 0 && Number.isInteger(position);
}

function SeriesCard({
  series,
  onSelect,
  onAddSeries,
}: {
  series: SearchSeries;
  onSelect: SeriesProps["onSelect"];
  onAddSeries: SeriesProps["onAddSeries"];
}) {
  const { copy, number } = useLanguage();
  const [includeOptional, setIncludeOptional] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const members = useMemo(
    () =>
      [...series.members].sort((left, right) => {
        const a = left.series?.position;
        const b = right.series?.position;
        if (a == null && b == null)
          return (
            left.title.localeCompare(right.title) ||
            left.id.localeCompare(right.id)
          );
        return (
          (a ?? Number.POSITIVE_INFINITY) - (b ?? Number.POSITIVE_INFINITY)
        );
      }),
    [series.members],
  );
  let mainCount = 0;
  for (const book of members) {
    if (isMainBook(book)) mainCount++;
  }

  const addSeries = () => {
    const eligible: SeriesBook[] = [];
    const missing: string[] = [];
    const seen = new Set<string>();
    for (const book of members) {
      if (!includeOptional && !isMainBook(book)) continue;
      const id = book.id.startsWith(`${book.source}:`)
        ? book.id
        : `${book.source}:${book.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      if (
        book.page_count != null &&
        Number.isSafeInteger(book.page_count) &&
        book.page_count > 0
      ) {
        eligible.push(book);
      } else {
        missing.push(book.title);
      }
    }
    setSkipped(missing);
    if (eligible.length > 0) onAddSeries(eligible);
  };

  return (
    <li class="book-search__series">
      <div class="book-search__series-heading">
        <div class="book-search__work-heading">
          <strong>{series.name}</strong>
          <span>{series.author}</span>
          <span class="book-search__series-count">
            {copy.search.seriesCounts(
              members.length,
              mainCount,
              members.length - mainCount,
            )}
          </span>
        </div>
        <label class="book-search__series-option">
          <input
            type="checkbox"
            checked={includeOptional}
            aria-label={`${copy.search.includeOptional}: ${series.name}`}
            onChange={(event) => {
              setIncludeOptional(event.currentTarget.checked);
              setSkipped([]);
            }}
          />
          {copy.search.includeOptional}
        </label>
        <button
          type="button"
          class="hon-btn hon-btn--accent"
          aria-label={`${copy.search.addSeries}: ${series.name}`}
          onClick={addSeries}
        >
          {copy.search.addSeries}
        </button>
        {series.incomplete && (
          <p class="book-search__series-warning">
            {copy.search.seriesIncomplete}
          </p>
        )}
        <p class="book-search__series-warning" aria-live="polite">
          {skipped.length > 0
            ? copy.search.seriesSkipped(skipped.join(", "))
            : ""}
        </p>
      </div>
      <ul class="book-search__editions">
        {members.map((book) => (
          <li key={book.id} class="book-search__result-item">
            <button
              type="button"
              class="book-search__result"
              onClick={() => onSelect(book)}
            >
              <BookCover book={book} />
              <span class="book-search__result-info">
                <span class="book-search__result-title">{book.title}</span>
                <span class="hon-eyebrow book-search__result-series">
                  {copy.books.seriesPosition(
                    book.series?.name ?? series.name,
                    book.series?.position ?? null,
                  )}
                </span>
                <span class="book-search__result-meta">
                  {book.page_count
                    ? copy.books.pageCount(number(book.page_count))
                    : copy.search.pagesNotListed}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </li>
  );
}

export function SeriesSearchResults({
  series,
  query,
  onSelect,
  onAddSeries,
}: SeriesProps) {
  if (series.length === 0) return null;
  return (
    <ul
      class="book-search__results book-search__series-results"
      id="book-series-results"
    >
      {series.map((item) => (
        <SeriesCard
          key={`${query}:${item.id}`}
          series={item}
          onSelect={onSelect}
          onAddSeries={onAddSeries}
        />
      ))}
    </ul>
  );
}
