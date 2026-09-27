import { BookCover } from "../features/books/book-art";
import { bookVisualStyle } from "../features/books/book-visuals";
import { useBookReorder } from "../hooks/use-book-reorder";
import type { Book, ReadingMethod, ScheduleResult } from "../types";
import { Icon } from "./icon";
import { ReorderControls } from "./reorder-controls";

interface Props {
  books: Book[];
  result: ScheduleResult;
  pagesPerDay: number;
  method: ReadingMethod;
  onReorder: (books: Book[]) => void;
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function ScheduleView({
  books,
  result,
  pagesPerDay,
  method,
  onReorder,
}: Props) {
  const { dragState, getItemStyle, handlePointerDown, setItemRef } =
    useBookReorder(books, onReorder);
  const schedulesByBookId = new Map(
    result.books.map((schedule) => [schedule.book.id, schedule]),
  );

  return (
    <div class={`schedule-view schedule-view--${method}`}>
      <div class="schedule-view__summary hon-mono">
        <span>
          {result.total_pages.toLocaleString()} pages ·{" "}
          {result.total_reading_days} reading day
          {result.total_reading_days === 1 ? "" : "s"} · {pagesPerDay}pp/day
          {method === "interleaved" ? " shared total" : ""}
        </span>
        <span class="schedule-view__finish">
          Finishes {formatDate(result.finish_date)}
        </span>
      </div>

      {method === "interleaved" && (
        <p class="schedule-view__note">
          <Icon name="info" size={14} aria-hidden="true" />
          {pagesPerDay} pages/day shared across books.
        </p>
      )}

      <ul class="schedule-view__list" aria-label="Reorder your schedule">
        {books.flatMap((book, index) => {
          const schedule = schedulesByBookId.get(book.id);
          if (!schedule) return [];
          const { start_date, finish_date, daily_pages } = schedule;
          const isDragging =
            dragState?.bookId === book.id && dragState.activated;
          const isDropTarget =
            dragState?.targetIndex === index &&
            dragState.targetIndex !== dragState.originIndex;

          return (
            <li
              key={book.id}
              ref={(element) => setItemRef(book.id, element)}
              data-book-id={book.id}
              class={`schedule-view__item${isDragging ? " schedule-view__item--dragging" : ""}${isDropTarget ? " schedule-view__item--drop-target" : ""}`}
              style={{
                ...bookVisualStyle(book),
                ...getItemStyle(index, book.id),
              }}
            >
              <div class="schedule-view__cover">
                <BookCover book={book} />
                <span class="schedule-view__station">
                  <span class="sr-only">Position </span>
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <div class="schedule-view__content">
                <div class="schedule-view__book-info">
                  <span class="schedule-view__book-title">{book.title}</span>
                  <span class="schedule-view__book-pages hon-mono">
                    {book.pages_read && book.pages_read > 0
                      ? `${book.pages_read.toLocaleString()} / ${book.page_count.toLocaleString()} pp`
                      : `${book.page_count.toLocaleString()} pp`}
                  </span>
                </div>
                <div class="schedule-view__dates hon-mono">
                  <span>{formatDate(start_date)}</span>
                  <Icon name="arrowRight" size={16} />
                  <span>{formatDate(finish_date)}</span>
                </div>
                <ReorderControls
                  title={book.title}
                  first={index === 0}
                  last={index === books.length - 1}
                  onPointerDown={(event) => handlePointerDown(book.id, event)}
                  onMove={(direction) => {
                    const next = [...books];
                    const [moved] = next.splice(index, 1);
                    next.splice(index + direction, 0, moved);
                    onReorder(next);
                  }}
                />
                {method === "interleaved" && daily_pages ? (
                  <p class="schedule-view__detail hon-mono">
                    About {daily_pages} pages/day
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
