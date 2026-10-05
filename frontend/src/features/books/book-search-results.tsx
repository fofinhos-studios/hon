import { useLanguage } from "../../i18n";
import type { SearchBook } from "../../types";
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
                <li key={`${book.source}:${book.id}`} class="book-search__result-item">
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
