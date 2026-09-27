import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../../components/icon";
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
  const progress = Math.round(((book.pages_read ?? 0) / book.page_count) * 100);
  const [editing, setEditing] = useState(false);
  const [pages, setPages] = useState(String(book.page_count));
  const pageInput = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const restoreEditFocus = useRef(false);
  const minimum = Math.max(1, book.pages_read ?? 0);
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
            aria-label={`Remove ${book.title}`}
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
            aria-label={`View ${book.title} on Goodreads (opens in a new tab)`}
          >
            <BookCover book={book} priority={imagePriority} />
          </a>
          <div class="book-plate__info">
            <h3 class="book-plate__title">
              <span class="book-plate__position">
                <span class="sr-only">Position </span>
                {index + 1}
              </span>
              <a
                class="book-title-link"
                href={goodreadsUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="View on Goodreads"
                aria-label={`View ${book.title} on Goodreads (opens in a new tab)`}
              >
                {book.title}
              </a>
            </h3>
            <p>{book.author}</p>
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
                    Total pages for {book.title}
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
                    Save
                  </button>
                  <button type="button" class="hon-btn" onClick={closeEditor}>
                    Cancel
                  </button>
                  {!valid && (
                    <p class="book-plate__edit-error" role="alert">
                      Enter a whole number of at least {minimum} pages
                      {minimum > 1 ? " to keep your reading progress" : ""}.
                    </p>
                  )}
                </form>
              ) : (
                <span class="hon-eyebrow">
                  {book.page_count.toLocaleString()} pages
                </span>
              )}
              {!editing && (
                <button
                  type="button"
                  class="book-plate__edit-trigger"
                  ref={editButton}
                  aria-label={`Edit page count for ${book.title}`}
                  aria-expanded={false}
                  onClick={() => {
                    setPages(String(book.page_count));
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
            <span class="sr-only">Pages read</span>
            <input
              type="number"
              min="0"
              max={book.page_count}
              placeholder="0"
              value={book.pages_read ?? ""}
              onInput={(event) =>
                onUpdateProgress(
                  parseProgressInput(
                    event.currentTarget.value,
                    book.page_count,
                  ),
                )
              }
              class="hon-input"
              aria-label={`Pages read for ${book.title}`}
            />
          </label>
          <span class="book-plate__progress-total">/ {book.page_count} pp</span>
          <span>or</span>
          <label>
            <span class="sr-only">Percent</span>
            <input
              type="number"
              min="0"
              max="100"
              placeholder="0"
              value={book.pages_read !== undefined ? progress : ""}
              onInput={(event) =>
                onUpdateProgress(
                  pagesFromPercent(event.currentTarget.value, book.page_count),
                )
              }
              class="hon-input"
              aria-label={`Percentage read for ${book.title}`}
            />
          </label>
          <span>%</span>
        </div>
        <div class="book-plate__progress-summary">
          <div class="book-plate__progress-heading">
            <span class="hon-eyebrow">Reading progress</span>
            <span>{progress}%</span>
          </div>
          <progress
            value={book.pages_read ?? 0}
            max={book.page_count}
            aria-label={`Reading progress for ${book.title}`}
          />
        </div>
      </div>
      <ArtCredit book={book} />
    </li>
  );
}
