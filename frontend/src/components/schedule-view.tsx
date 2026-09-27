import { useState } from "preact/hooks";
import { BookBackdrop, BookCover } from "../features/books/book-art";
import { bookVisualStyle } from "../features/books/book-visuals";
import { goodreadsBookUrl } from "../features/books/goodreads-link";
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

function formatDate(iso: string, compact = false): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: compact ? undefined : "numeric",
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
  const [collapsed, setCollapsed] = useState(true);
  const { dragState, getItemStyle, handlePointerDown, setItemRef } =
    useBookReorder(books, onReorder);
  const schedulesByBookId = new Map(
    result.books.map((schedule) => [schedule.book.id, schedule]),
  );

  return (
    <div
      class={`schedule-view schedule-view--${method}${collapsed ? " schedule-view--compact" : ""}`}
    >
      <div class="hon-section-heading">
        <h2>
          <Icon name="route" size={24} />
          <span>Schedule</span>
        </h2>
        <button
          type="button"
          class="hon-btn schedule-view__toggle"
          aria-expanded={!collapsed}
          aria-controls="schedule-cards"
          onClick={() => setCollapsed((value) => !value)}
        >
          <Icon name={collapsed ? "expand" : "collapse"} size={16} />
          {collapsed ? "Expand cards" : "Collapse cards"}
        </button>
      </div>
      <div class="schedule-view__summary hon-mono">
        <span class="schedule-view__finish">
          Finishes {formatDate(result.finish_date)}
        </span>
        <span class="schedule-view__totals">
          {books.length} book{books.length === 1 ? "" : "s"} ·{" "}
          {result.total_pages.toLocaleString()} pages ·{" "}
          {result.total_reading_days} reading day
          {result.total_reading_days === 1 ? "" : "s"} · {pagesPerDay}pp/day
        </span>
      </div>

      {method === "interleaved" && (
        <p class="schedule-view__note">
          <Icon name="info" size={14} aria-hidden="true" />
          {pagesPerDay} pages/day shared across books.
        </p>
      )}

      <ul
        class="schedule-view__list"
        id="schedule-cards"
        aria-label="Reorder your schedule"
      >
        {books.flatMap((book, index) => {
          const schedule = schedulesByBookId.get(book.id);
          if (!schedule) return [];
          const { start_date, finish_date, daily_pages } = schedule;
          const imagePriority =
            index === 0 ? "high" : index === 1 ? "eager" : undefined;
          const goodreadsUrl = goodreadsBookUrl(book);
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
              <BookBackdrop book={book} priority={imagePriority} />
              {collapsed ? (
                <span
                  class="reorder-handle schedule-view__spine-handle"
                  title="Drag to reorder"
                  onPointerDown={(event) => handlePointerDown(book.id, event)}
                >
                  <Icon name="grip" size={20} aria-hidden="true" />
                  <span class="schedule-view__spine-number hon-mono">
                    <span class="sr-only">Position </span>
                    {index + 1}
                  </span>
                </span>
              ) : (
                <div class="schedule-view__expanded-media">
                  <span
                    class="reorder-handle"
                    title="Drag to reorder"
                    onPointerDown={(event) => handlePointerDown(book.id, event)}
                  >
                    <Icon name="grip" />
                  </span>
                  <div class="schedule-view__cover">
                    <a
                      class="book-cover-link"
                      href={goodreadsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`View ${book.title} on Goodreads (opens in a new tab)`}
                    >
                      <BookCover book={book} priority={imagePriority} />
                    </a>
                    <span class="schedule-view__station">
                      <span class="sr-only">Position </span>
                      {index + 1}
                    </span>
                  </div>
                </div>
              )}
              <div class="schedule-view__content">
                <div class="schedule-view__book-info">
                  <a
                    class="schedule-view__book-title book-title-link"
                    href={goodreadsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`View ${book.title} on Goodreads (opens in a new tab)`}
                    title={
                      collapsed
                        ? `${book.title} — ${book.author} · View on Goodreads`
                        : "View on Goodreads"
                    }
                  >
                    {book.title}
                  </a>
                  {collapsed && <span class="sr-only">{book.author}</span>}
                  {!collapsed && (
                    <span class="schedule-view__book-pages hon-mono">
                      {book.pages_read && book.pages_read > 0
                        ? `${book.pages_read.toLocaleString()} / ${book.page_count.toLocaleString()} pp`
                        : `${book.page_count.toLocaleString()} pp`}
                    </span>
                  )}
                </div>
                <div
                  class={
                    collapsed
                      ? "schedule-view__spine-meta hon-mono"
                      : "schedule-view__dates hon-mono"
                  }
                >
                  {collapsed ? (
                    <>
                      <span class="schedule-view__book-pages">
                        {book.pages_read
                          ? `${book.pages_read.toLocaleString()} / `
                          : ""}
                        {book.page_count.toLocaleString()} pp
                      </span>
                      <span aria-hidden="true">•</span>
                      <span
                        class="schedule-view__spine-dates"
                        title={`${formatDate(start_date)} → ${formatDate(finish_date)}`}
                      >
                        <span class="sr-only">
                          {formatDate(start_date)} to {formatDate(finish_date)}
                        </span>
                        <span aria-hidden="true">
                          {formatDate(start_date, true)} →{" "}
                          {formatDate(finish_date, true)}
                        </span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span>{formatDate(start_date)}</span>
                      <Icon name="arrowRight" size={16} />
                      <span>{formatDate(finish_date)}</span>
                    </>
                  )}
                </div>
                <ReorderControls
                  showHandle={false}
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
                  <p
                    class={
                      collapsed
                        ? "sr-only schedule-view__detail"
                        : "schedule-view__detail hon-mono"
                    }
                  >
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
