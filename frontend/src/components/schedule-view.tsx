import type { ScheduleResult } from "../types";

interface Props {
  result: ScheduleResult;
  pagesPerDay: number;
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

export function ScheduleView({ result, pagesPerDay }: Props) {
  return (
    <div class="schedule-view">
      <ul class="schedule-view__list">
        {result.books.map(({ book, start_date, finish_date }) => (
          <li key={book.id} class="schedule-view__item">
            <div class="schedule-view__book-info">
              <span class="schedule-view__book-title">{book.title}</span>
              <span class="schedule-view__book-pages hon-mono">
                {book.page_count.toLocaleString()}pp
              </span>
            </div>
            <div class="schedule-view__dates hon-mono">
              <span>{formatDate(start_date)}</span>
              <span class="schedule-view__arrow">→</span>
              <span>{formatDate(finish_date)}</span>
            </div>
          </li>
        ))}
      </ul>

      <div class="schedule-view__summary hon-mono">
        <span>
          {result.total_pages.toLocaleString()} pages ·{" "}
          {result.total_reading_days} reading day
          {result.total_reading_days === 1 ? "" : "s"} · {pagesPerDay}pp/day
        </span>
        <span class="schedule-view__finish">
          Finishes {formatDate(result.finish_date)}
        </span>
      </div>
    </div>
  );
}
