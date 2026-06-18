import { GripVertical, X } from "lucide-preact";
import type { JSX } from "preact";
import type { Book } from "../../types";
import { pagesFromPercent, parseProgressInput } from "./book-progress";

interface Props {
  book: Book;
  isDragging: boolean;
  isDropTarget: boolean;
  style?: JSX.CSSProperties;
  onPointerDown: (event: PointerEvent) => void;
  onRemove: () => void;
  onUpdateProgress: (pagesRead: number | undefined) => void;
  itemRef: (element: HTMLLIElement | null) => void;
}

export function BookCard({
  book,
  isDragging,
  isDropTarget,
  style,
  onPointerDown,
  onRemove,
  onUpdateProgress,
  itemRef,
}: Props) {
  return (
    <li
      ref={itemRef}
      data-book-id={book.id}
      class={`book-list__item${isDragging ? " book-list__item--dragging" : ""}${isDropTarget ? " book-list__item--drop-target" : ""}`}
      style={style}
      onPointerDown={onPointerDown}
    >
      <span class="book-list__drag-handle" aria-hidden="true">
        <GripVertical size={16} aria-hidden="true" />
      </span>
      {book.cover_url && (
        <img
          class="book-list__cover"
          src={book.cover_url}
          alt=""
          draggable={false}
          width={28}
          height={42}
        />
      )}
      <div class="book-list__info">
        <span class="book-list__title">{book.title}</span>
        <span class="book-list__meta hon-mono">
          {book.author} · {book.page_count}pp
        </span>
        <div class="book-list__progress-row">
          <span class="book-list__progress-label">Read:</span>
          <input
            type="number"
            min="0"
            max={book.page_count}
            placeholder="0"
            value={book.pages_read ?? ""}
            onInput={(event) =>
              onUpdateProgress(
                parseProgressInput(
                  (event.target as HTMLInputElement).value,
                  book.page_count,
                ),
              )
            }
            class="hon-input book-list__progress-input hon-mono"
            aria-label={`Pages read for ${book.title}`}
          />
          <span class="book-list__progress-slash">/</span>
          <span class="book-list__progress-total hon-mono">
            {book.page_count} pp
          </span>
          <span class="book-list__progress-or">or</span>
          <input
            type="number"
            min="0"
            max="100"
            placeholder="0"
            value={
              book.pages_read !== undefined
                ? Math.round((book.pages_read / book.page_count) * 100)
                : ""
            }
            onInput={(event) =>
              onUpdateProgress(
                pagesFromPercent(
                  (event.target as HTMLInputElement).value,
                  book.page_count,
                ),
              )
            }
            class="hon-input book-list__progress-input hon-mono"
            aria-label={`Percentage read for ${book.title}`}
          />
          <span class="book-list__progress-percent hon-mono">%</span>
        </div>
      </div>
      <button
        type="button"
        class="book-list__remove"
        aria-label={`Remove ${book.title}`}
        onClick={onRemove}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </li>
  );
}
