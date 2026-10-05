import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../../components/icon";
import { useLanguage } from "../../i18n";
import type { Book } from "../../types";
import { ArtCredit, BookBackdrop, BookCover } from "./book-art";
import { pagesFromPercent, parseProgressInput } from "./book-progress";
import { bookVisualStyle } from "./book-visuals";
import { goodreadsBookUrl } from "./goodreads-link";

interface Props {
  book: Book;
  index?: number;
  onRemove: () => void;
  onUpdateProgress: (pagesRead: number | undefined) => void;
  onUpdatePageCount: (pages: number) => void;
}

export function BookCard({
  book,
  index = 0,
  onRemove,
  onUpdateProgress,
  onUpdatePageCount,
}: Props) {
  const { copy, number, author } = useLanguage();
  const maximum =
    book.kind === "page" ? book.page_count : book.duration_minutes;
  const completed =
    book.kind === "page" ? book.pages_read : book.minutes_listened;
  const progress = Math.round(((completed ?? 0) / maximum) * 100);
  const [editing, setEditing] = useState(false);
  const [pages, setPages] = useState(String(maximum));
  const pageInput = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const restoreEditFocus = useRef(false);
  const minimum = Math.max(1, completed ?? 0);
  const total = Number(pages);
  const valid = Number.isSafeInteger(total) && total >= minimum;
  const goodreadsUrl = goodreadsBookUrl(book);
  const imagePriority =
    index === 0 ? "high" : index === 1 ? "eager" : undefined;
  useEffect(() => {
    if (editing) {
      pageInput.current?.focus();
      pageInput.current?.select();
    } else if (restoreEditFocus.current) {
      editButton.current?.focus();
      restoreEditFocus.current = false;
    }
  }, [editing]);
  const closeEditor = () => {
    restoreEditFocus.current = true;
    setEditing(false);
  };
  return (
    <li data-book-id={book.id} class="book-plate" style={bookVisualStyle(book)}>
      <div class="book-plate__visual">
        <BookBackdrop book={book} priority={imagePriority} />
        <div class="book-plate__actions">
          <button
            type="button"
            class="hon-icon-button"
            aria-label={copy.books.remove(book.title)}
            onClick={onRemove}
          >
            <Icon name="x" />
          </button>
        </div>
        <div class="book-plate__body">
          <a
            class="book-cover-link"
            href={goodreadsUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={copy.books.goodreads(book.title)}
          >
            <BookCover book={book} priority={imagePriority} />
          </a>
          <div class="book-plate__info">
            <h3 class="book-plate__title">
              <span class="book-plate__position">
                <span class="sr-only">{copy.books.position} </span>
                {index + 1}
              </span>
              <a
                class="book-title-link"
                href={goodreadsUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={copy.books.goodreadsTitle}
                aria-label={copy.books.goodreads(book.title)}
              >
                {book.title}
              </a>
            </h3>
            <p>{author(book.author)}</p>
            <p class="hon-eyebrow">
              {book.kind === "audiobook"
                ? copy.books.audiobook
                : book.format === "physical"
                  ? copy.books.physical
                  : book.format === "digital"
                    ? copy.books.digital
                    : copy.books.unspecified}
            </p>
            {book.kind === "audiobook" && book.narrators.length > 0 && (
              <p>{copy.books.narrators(book.narrators.join(", "))}</p>
            )}
            <div class="book-plate__page-count">
              {editing ? (
                <form
                  class="book-plate__editor"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!valid) return;
                    onUpdatePageCount(total);
                    closeEditor();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      closeEditor();
                    }
                  }}
                >
                  <label class="sr-only" for={`book-pages-${book.id}`}>
                    {book.kind === "page"
                      ? copy.books.totalPages(book.title)
                      : copy.books.totalMinutes(book.title)}
                  </label>
                  <input
                    id={`book-pages-${book.id}`}
                    ref={pageInput}
                    class="hon-input"
                    type="number"
                    required
                    min={minimum}
                    step="1"
                    value={pages}
                    aria-invalid={!valid}
                    onInput={(event) => setPages(event.currentTarget.value)}
                  />
                  <button
                    type="submit"
                    class="hon-btn hon-btn--accent"
                    disabled={!valid}
                  >
                    {copy.books.save}
                  </button>
                  <button type="button" class="hon-btn" onClick={closeEditor}>
                    {copy.books.cancel}
                  </button>
                  {!valid && (
                    <p class="book-plate__edit-error" role="alert">
                      {book.kind === "page"
                        ? copy.books.editError(minimum)
                        : copy.books.durationEditError(minimum)}
                    </p>
                  )}
                </form>
              ) : (
                <span class="hon-eyebrow">
                  {book.kind === "page"
                    ? copy.books.pageCount(number(maximum))
                    : copy.books.durationCount(number(maximum))}
                </span>
              )}
              {!editing && (
                <button
                  type="button"
                  class="book-plate__edit-trigger"
                  ref={editButton}
                  aria-label={
                    book.kind === "page"
                      ? copy.books.editPageCount(book.title)
                      : copy.books.editDuration(book.title)
                  }
                  aria-expanded={false}
                  onClick={() => {
                    setPages(String(maximum));
                    setEditing(true);
                  }}
                >
                  <Icon name="pencil" size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <div class="book-plate__progress">
        <div class="book-plate__progress-inputs">
          <label>
            <span class="sr-only">
              {book.kind === "page"
                ? copy.books.pagesRead
                : copy.books.minutesListened}
            </span>
            <input
              type="number"
              min="0"
              max={maximum}
              placeholder="0"
              value={completed ?? ""}
              onInput={(event) =>
                onUpdateProgress(
                  parseProgressInput(event.currentTarget.value, maximum),
                )
              }
              class="hon-input"
              aria-label={
                book.kind === "page"
                  ? copy.books.pagesReadFor(book.title)
                  : copy.books.minutesListenedFor(book.title)
              }
            />
          </label>
          <span class="book-plate__progress-total">
            /{" "}
            {book.kind === "page"
              ? copy.books.shortPages(number(maximum))
              : copy.books.shortMinutes(number(maximum))}
          </span>
          <span>{copy.books.or}</span>
          <label>
            <span class="sr-only">{copy.books.percent}</span>
            <input
              type="number"
              min="0"
              max="100"
              placeholder="0"
              value={completed !== undefined ? progress : ""}
              onInput={(event) =>
                onUpdateProgress(
                  pagesFromPercent(event.currentTarget.value, maximum),
                )
              }
              class="hon-input"
              aria-label={
                book.kind === "page"
                  ? copy.books.percentageReadFor(book.title)
                  : copy.books.percentageListenedFor(book.title)
              }
            />
          </label>
          <span>%</span>
        </div>
        <div class="book-plate__progress-summary">
          <div class="book-plate__progress-heading">
            <span class="hon-eyebrow">
              {book.kind === "page"
                ? copy.books.readingProgress
                : copy.books.listeningProgress}
            </span>
            <span>{progress}%</span>
          </div>
          <progress
            value={completed ?? 0}
            max={maximum}
            aria-label={
              book.kind === "page"
                ? copy.books.readingProgressFor(book.title)
                : copy.books.listeningProgressFor(book.title)
            }
          />
        </div>
      </div>
      <ArtCredit book={book} />
    </li>
  );
}
