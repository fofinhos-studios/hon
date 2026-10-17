import { useMemo, useState } from "preact/hooks";
import { useLanguage } from "../../i18n";
import type { SearchBook, SearchSeries } from "../../types";
import { BookCover } from "./book-art";
import { EditionPicker } from "./edition-picker";

interface Props {
  results: SearchBook[];
  onSelect: (edition: SearchBook, editions: SearchBook[]) => void;
}

export function groupSearchResults(results: SearchBook[]): SearchBook[][] {
  const knownByWork = new Map<string, string | null>();
  for (const book of results) {
    if (!book.language || book.language === "und") continue;
    const key =
      book.work_key ||
      `${book.title.toLowerCase()}|${book.author.toLowerCase()}|${book.language.toLowerCase()}`;
    const base = key.slice(0, key.lastIndexOf("|"));
    const previous = knownByWork.get(base);
    if (previous === undefined) knownByWork.set(base, key);
    else if (previous !== key) knownByWork.set(base, null);
  }

  const groups = new Map<string, SearchBook[]>();
  for (const book of results) {
    const originalKey =
      book.work_key ||
      `${book.title.toLowerCase()}|${book.author.toLowerCase()}|${book.language ?? "und"}`;
    const base = originalKey.slice(0, originalKey.lastIndexOf("|"));
    const key =
      !book.language || book.language === "und"
        ? knownByWork.get(base) || originalKey
        : originalKey;
    const group = groups.get(key) ?? [];
    group.push(book);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function BookSearchResults({ results, onSelect }: Props) {
  const { copy, languageName, number } = useLanguage();
  const [selectedWork, setSelectedWork] = useState<string | null>(null);
  if (results.length === 0) return null;
  const groups = groupSearchResults(results);
  const selectedEditions = groups.find(
    (editions) => (editions[0].work_key || editions[0].id) === selectedWork,
  );
  return (
    <>
      <ul class="book-search__results" id="book-search-results">
        {groups.map((editions, index) => {
          const work =
            editions.find(
              (edition) => edition.language && edition.language !== "und",
            ) ?? editions[0];
          const artwork =
            editions.find(
              (edition) => edition.cover_url || edition.cover_fallback_url,
            ) ?? work;
          return (
            <li
              key={editions[0].work_key || editions[0].id}
              class="book-search__work"
            >
              <button
                type="button"
                class="book-search__result"
                onClick={() =>
                  editions.length === 1
                    ? onSelect(work, editions)
                    : setSelectedWork(editions[0].work_key || editions[0].id)
                }
              >
                <BookCover
                  book={artwork}
                  priority={index === 0 ? "high" : undefined}
                />
                <span class="book-search__result-main book-search__result-info">
                  <span class="book-search__result-title">{work.title}</span>
                  <span class="book-search__result-meta">{work.author}</span>
                  {work.language && (
                    <span class="book-search__result-meta">
                      {languageName(work.language)}
                    </span>
                  )}
                  {work.kind === "page" && work.series && (
                    <span class="hon-eyebrow book-search__result-series">
                      {copy.books.seriesPosition(
                        work.series.name,
                        work.series.position,
                      )}
                    </span>
                  )}
                  {editions.length === 1 && (
                    <span class="book-search__result-meta">
                      {work.kind === "audiobook"
                        ? copy.books.audiobook
                        : work.format === "physical"
                          ? copy.books.physical
                          : work.format === "digital"
                            ? copy.books.digital
                            : copy.books.unspecified}
                      {" · "}
                      {work.kind === "audiobook"
                        ? work.duration_minutes
                          ? copy.books.durationCount(
                              number(work.duration_minutes),
                            )
                          : copy.search.durationNotListed
                        : work.page_count
                          ? copy.books.pageCount(number(work.page_count))
                          : copy.search.pagesNotListed}
                      {work.publisher ? ` · ${work.publisher}` : ""}
                      {work.isbn ? ` · ISBN ${work.isbn}` : ""}
                    </span>
                  )}
                </span>
                <span class="book-search__result-actions">
                  <span class="book-search__edition-count">
                    {copy.search.editionCount(editions.length)}
                  </span>
                  {editions.length > 1 && (
                    <span>{copy.search.chooseEdition}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {selectedEditions && selectedEditions.length > 1 && (
        <EditionPicker
          title={selectedEditions[0].title}
          editions={selectedEditions}
          onSelect={(edition) => {
            onSelect(edition, selectedEditions);
            setSelectedWork(null);
          }}
          onClose={() => setSelectedWork(null)}
        />
      )}
    </>
  );
}

interface SeriesProps {
  series: SearchSeries[];
  query: string;
  onAddSeries: (books: Extract<SearchBook, { kind: "page" }>[]) => void;
}

type SeriesBook = Extract<SearchBook, { kind: "page" }>;

function isMainBook(book: SeriesBook): boolean {
  const position = book.series?.position;
  return position != null && position > 0 && Number.isInteger(position);
}

function compareSeriesBooks(left: SeriesBook, right: SeriesBook): number {
  const a = left.series?.position;
  const b = right.series?.position;
  if (a == null && b == null)
    return (
      left.title.localeCompare(right.title) || left.id.localeCompare(right.id)
    );
  return (a ?? Number.POSITIVE_INFINITY) - (b ?? Number.POSITIVE_INFINITY);
}

function SeriesCard({
  series,
  onAddSeries,
}: {
  series: SearchSeries;
  onAddSeries: SeriesProps["onAddSeries"];
}) {
  const { copy } = useLanguage();
  const [includeOptional, setIncludeOptional] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const members = useMemo(
    () =>
      [...series.members].sort(
        (left, right) =>
          Number(isMainBook(right)) - Number(isMainBook(left)) ||
          compareSeriesBooks(left, right),
      ),
    [series.members],
  );
  let mainCount = 0;
  for (const book of members) {
    if (isMainBook(book)) mainCount++;
  }
  const artwork =
    members.find((book) => book.cover_url || book.cover_fallback_url) ??
    members[0];

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
    if (eligible.length > 0) onAddSeries(eligible.sort(compareSeriesBooks));
  };

  return (
    <li class="book-search__series">
      <div class="book-search__series-heading">
        {artwork && (
          <span class="book-search__series-cover">
            <BookCover book={artwork} />
          </span>
        )}
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
          disabled={mainCount === 0 && !includeOptional}
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
    </li>
  );
}

export function SeriesSearchResults({
  series,
  query,
  onAddSeries,
}: SeriesProps) {
  if (series.length === 0) return null;
  return (
    <ul
      class="book-search__results book-search__series-results"
      id="book-series-results"
    >
      {[...new Map(series.map((item) => [item.id, item])).values()].map(
        (item) => (
          <SeriesCard
            key={`${query}:${item.id}`}
            series={item}
            onAddSeries={onAddSeries}
          />
        ),
      )}
    </ul>
  );
}
