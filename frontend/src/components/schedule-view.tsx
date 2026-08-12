import { GripVertical, Info } from "lucide-preact";
import { useBookReorder } from "../hooks/use-book-reorder";
import type { Book, ReadingMethod, ScheduleResult } from "../types";

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
    <div class="schedule-view">
      {method === "interleaved" && (
        <p class="schedule-view__note">
          <Info size={14} aria-hidden="true" />
          Shared budget: {pagesPerDay} total pages per reading day across all
          active books, weighted by remaining pages.
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
              style={getItemStyle(index, book.id)}
              onPointerDown={(event) => handlePointerDown(book.id, event)}
            >
              <span class="schedule-view__drag-handle" aria-hidden="true">
                <GripVertical size={16} aria-hidden="true" />
              </span>
              {book.cover_url && (
                <img
                  class="schedule-view__cover"
                  src={book.cover_url}
                  alt=""
                  width={32}
                  height={48}
                />
              )}
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
                  <span class="schedule-view__arrow">→</span>
                  <span>{formatDate(finish_date)}</span>
                </div>
                {method === "interleaved" && daily_pages ? (
                  <p class="schedule-view__detail hon-mono">
                    Read about {daily_pages} pages per reading day while this
                    book is active.
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

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
    </div>
  );
}
