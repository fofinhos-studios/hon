import { useState } from "preact/hooks";
import { BookBackdrop, BookCover } from "../features/books/book-art";
import { bookVisualStyle } from "../features/books/book-visuals";
import { goodreadsBookUrl } from "../features/books/goodreads-link";
import { useBookReorder } from "../hooks/use-book-reorder";
import { useLanguage } from "../i18n";
import {
  CalendarUrlTooLongError,
  createCalendarSnapshot,
  createCalendarUrl,
  downloadCalendar,
} from "../services/calendar-export";
import type { Book, ReadingMethod, ScheduleResult } from "../types";
import { Icon } from "./icon";
import { ReorderControls } from "./reorder-controls";

interface Props {
  books: Book[];
  result: ScheduleResult;
  pagesPerDay: number;
  minutesPerDay?: number;
  method: ReadingMethod;
  onReorder: (books: Book[]) => void;
}

export function ScheduleView({
  books,
  result,
  pagesPerDay,
  minutesPerDay = 30,
  method,
  onReorder,
}: Props) {
  const { copy, date: formatDate, number, author, locale } = useLanguage();
  const [collapsed, setCollapsed] = useState(true);
  const [copyState, setCopyState] = useState<"idle" | "working" | "done">(
    "idle",
  );
  const [downloadState, setDownloadState] = useState<
    "idle" | "working" | "done"
  >("idle");
  const [exportError, setExportError] = useState("");
  const { dragState, getItemStyle, handlePointerDown, setItemRef } =
    useBookReorder(books, onReorder);
  const schedulesByBookId = new Map(
    result.books.map((schedule) => [schedule.book.id, schedule]),
  );

  const handleCopyCalendarUrl = async () => {
    setCopyState("working");
    setExportError("");
    try {
      const snapshot = createCalendarSnapshot(result, locale);
      const url = await createCalendarUrl(snapshot);
      await navigator.clipboard.writeText(url);
      setCopyState("done");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch (error) {
      setCopyState("idle");
      setExportError(
        error instanceof CalendarUrlTooLongError
          ? copy.planner.calendarUrlTooLong
          : copy.planner.calendarCopyFailed,
      );
    }
  };

  const handleDownloadCalendar = async () => {
    setDownloadState("working");
    setExportError("");
    try {
      await downloadCalendar(createCalendarSnapshot(result, locale));
      setDownloadState("done");
      window.setTimeout(() => setDownloadState("idle"), 2000);
    } catch {
      setDownloadState("idle");
      setExportError(copy.planner.calendarDownloadFailed);
    }
  };

  return (
    <div
      class={`schedule-view schedule-view--${method}${collapsed ? " schedule-view--compact" : ""}`}
    >
      <div class="hon-section-heading">
        <h2>
          <Icon name="route" size={24} />
          <span>{copy.schedule}</span>
        </h2>
        <button
          type="button"
          class="hon-btn schedule-view__toggle"
          aria-expanded={!collapsed}
          aria-controls="schedule-cards"
          onClick={() => setCollapsed((value) => !value)}
        >
          <Icon name={collapsed ? "expand" : "collapse"} size={16} />
          {collapsed ? copy.planner.expand : copy.planner.collapse}
        </button>
      </div>
      <div class="schedule-view__summary hon-mono">
        <span class="schedule-view__finish">
          {copy.planner.finishes(formatDate(result.finish_date))}
        </span>
        <span class="schedule-view__totals">
          {copy.planner.bookCount(books.length)} ·{" "}
          {result.total_pages > 0 && (
            <>{copy.planner.pageCount(number(result.total_pages))} · </>
          )}
          {result.total_minutes > 0 && (
            <>{copy.planner.minuteCount(number(result.total_minutes))} · </>
          )}
          {copy.planner.dayCount(result.total_reading_days)}
          {result.total_pages > 0 && (
            <> · {copy.planner.dailyPace(number(pagesPerDay))}</>
          )}
          {result.total_minutes > 0 && (
            <> · {copy.planner.dailyMinutePace(number(minutesPerDay))}</>
          )}
        </span>
      </div>

      {method === "interleaved" && (
        <p class="schedule-view__note">
          <Icon name="info" size={14} aria-hidden="true" />
          {result.total_pages > 0 && (
            <span>{copy.planner.sharedPace(number(pagesPerDay))}</span>
          )}
          {result.total_minutes > 0 && (
            <span> {copy.planner.sharedMinutePace(number(minutesPerDay))}</span>
          )}
        </p>
      )}

      <div class="schedule-view__exports">
        <button
          type="button"
          class="hon-btn"
          disabled={result.sessions.length === 0 || copyState === "working"}
          aria-live="polite"
          aria-busy={copyState === "working" ? "true" : undefined}
          onClick={() => void handleCopyCalendarUrl()}
        >
          <Icon
            name={
              copyState === "done"
                ? "check"
                : copyState === "working"
                  ? "spinner"
                  : "copy"
            }
            size={18}
          />
          {copyState === "working"
            ? copy.planner.copyingCalendarUrl
            : copyState === "done"
              ? copy.planner.copiedCalendarUrl
              : copy.planner.copyCalendarUrl}
        </button>
        <button
          type="button"
          class="hon-btn hon-btn--accent"
          disabled={result.sessions.length === 0 || downloadState === "working"}
          aria-live="polite"
          aria-busy={downloadState === "working" ? "true" : undefined}
          onClick={() => void handleDownloadCalendar()}
        >
          <Icon
            name={
              downloadState === "done"
                ? "check"
                : downloadState === "working"
                  ? "spinner"
                  : "download"
            }
            size={18}
          />
          {downloadState === "working"
            ? copy.planner.downloadingCalendar
            : downloadState === "done"
              ? copy.planner.downloadedCalendar
              : copy.planner.downloadCalendar}
        </button>
      </div>
      {exportError && (
        <p class="schedule-view__export-error" role="alert">
          {exportError}
        </p>
      )}

      <ul
        class="schedule-view__list"
        id="schedule-cards"
        aria-label={copy.planner.reorder}
      >
        {books.flatMap((book, index) => {
          const schedule = schedulesByBookId.get(book.id);
          if (!schedule) return [];
          const { start_date, finish_date, daily_pages, daily_minutes } =
            schedule;
          const completed =
            book.kind === "page" ? book.pages_read : book.minutes_listened;
          const maximum =
            book.kind === "page" ? book.page_count : book.duration_minutes;
          const shortAmount =
            book.kind === "page"
              ? copy.books.shortPages(number(maximum))
              : copy.books.shortMinutes(number(maximum));
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
                  title={copy.planner.drag}
                  onPointerDown={(event) => handlePointerDown(book.id, event)}
                >
                  <Icon name="grip" size={20} aria-hidden="true" />
                  <span class="schedule-view__spine-number hon-mono">
                    <span class="sr-only">{copy.books.position} </span>
                    {index + 1}
                  </span>
                </span>
              ) : (
                <div class="schedule-view__expanded-media">
                  <span
                    class="reorder-handle"
                    title={copy.planner.drag}
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
                      aria-label={copy.books.goodreads(book.title)}
                    >
                      <BookCover book={book} priority={imagePriority} />
                    </a>
                    <span class="schedule-view__station">
                      <span class="sr-only">{copy.books.position} </span>
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
                    aria-label={copy.books.goodreads(book.title)}
                    title={
                      collapsed
                        ? `${book.title} — ${author(book.author)} · ${copy.books.goodreadsTitle}`
                        : copy.books.goodreadsTitle
                    }
                  >
                    {book.title}
                  </a>
                  {!collapsed && book.kind === "page" && book.series && (
                    <span class="hon-eyebrow">
                      {copy.books.seriesPosition(
                        book.series.name,
                        book.series.position,
                      )}
                    </span>
                  )}
                  {collapsed && (
                    <span class="sr-only">{author(book.author)}</span>
                  )}
                  {!collapsed && (
                    <span class="schedule-view__book-pages hon-mono">
                      {completed && completed > 0
                        ? `${number(completed)} / ${shortAmount}`
                        : shortAmount}
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
                        {completed ? `${number(completed)} / ` : ""}
                        {shortAmount}
                      </span>
                      <span aria-hidden="true">•</span>
                      <span
                        class="schedule-view__spine-dates"
                        title={`${formatDate(start_date)} → ${formatDate(finish_date)}`}
                      >
                        <span class="sr-only">
                          {formatDate(start_date)} {copy.planner.dateTo}{" "}
                          {formatDate(finish_date)}
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
                {method === "interleaved" && (daily_pages || daily_minutes) ? (
                  <p
                    class={
                      collapsed
                        ? "sr-only schedule-view__detail"
                        : "schedule-view__detail hon-mono"
                    }
                  >
                    {daily_pages
                      ? copy.planner.aboutPace(number(daily_pages))
                      : copy.planner.aboutMinutePace(
                          number(daily_minutes ?? 0),
                        )}
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
