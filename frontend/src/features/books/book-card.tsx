import type { JSX } from "preact";
import { Icon } from "../../components/icon";
import { ReorderControls } from "../../components/reorder-controls";
import type { Book } from "../../types";
import { ArtCredit, BookBackdrop, BookCover } from "./book-art";
import { pagesFromPercent, parseProgressInput } from "./book-progress";
import { bookVisualStyle } from "./book-visuals";

interface Props {
  book: Book;
  index?: number;
  last?: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  style?: JSX.CSSProperties;
  onPointerDown: (event: PointerEvent) => void;
  onRemove: () => void;
  onUpdateProgress: (pagesRead: number | undefined) => void;
  onMove?: (direction: -1 | 1) => void;
  onToggleBackground?: () => void;
  itemRef: (element: HTMLLIElement | null) => void;
}

export function BookCard({
  book,
  index = 0,
  last,
  isDragging,
  isDropTarget,
  style,
  onPointerDown,
  onRemove,
  onUpdateProgress,
  onMove,
  onToggleBackground,
  itemRef,
}: Props) {
  const progress = Math.round(((book.pages_read ?? 0) / book.page_count) * 100);
  return (
    <li
      ref={itemRef}
      data-book-id={book.id}
      class={`book-plate${isDragging ? " book-plate--dragging" : ""}${isDropTarget ? " book-plate--drop-target" : ""}`}
      style={{ ...bookVisualStyle(book), ...style }}
    >
      <div class="book-plate__visual">
        <BookBackdrop book={book} />
        <div class="book-plate__topline">
          <span class="book-plate__position">
            <span class="sr-only">Position </span>
            {String(index + 1).padStart(2, "0")}
          </span>
          <span class="hon-eyebrow">
            {progress >= 100
              ? "Finished"
              : progress > 0
                ? "In progress"
                : "To read"}
          </span>
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
          <BookCover book={book} />
          <div class="book-plate__info">
            <h3>{book.title}</h3>
            <p>{book.author}</p>
            <span class="hon-eyebrow">
              {book.page_count.toLocaleString()} pages
            </span>
          </div>
        </div>
      </div>
      <div class="book-plate__progress">
        <div class="book-plate__progress-heading">
          <span class="hon-eyebrow">Reading progress</span>
          <span>{progress}%</span>
        </div>
        <progress
          value={book.pages_read ?? 0}
          max={book.page_count}
          aria-label={`Reading progress for ${book.title}`}
        />
        <div class="book-plate__progress-inputs">
          <label>
            <span>Pages read</span>
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
            <span>Percent</span>
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
      </div>
      <div class="book-plate__actions">
        <ReorderControls
          title={book.title}
          onPointerDown={onPointerDown}
          onMove={onMove}
          first={index === 0}
          last={last}
        />
        {onToggleBackground && (book.cover_url || book.visuals?.artwork) && (
          <button
            class="hon-text-button"
            type="button"
            aria-label={`${book.background_hidden ? "Show" : "Hide"} background for ${book.title}`}
            onClick={onToggleBackground}
          >
            <Icon
              name={book.background_hidden ? "eye" : "eyeSlash"}
              size={16}
            />
            {book.background_hidden ? "Show background" : "Hide background"}
          </button>
        )}
      </div>
      <ArtCredit book={book} />
    </li>
  );
}
