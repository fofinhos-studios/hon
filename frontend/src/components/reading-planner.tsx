import { CalendarDays, Clock3, Route, Split } from "lucide-preact";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  calculatePagesPerDay,
  calculateSchedule,
  todayISO,
} from "../lib/scheduler";
import type { Book, DayOfWeek, ReadingMethod, ScheduleResult } from "../types";
import { DayPicker } from "./day-picker";
import { ScheduleView } from "./schedule-view";

const DEFAULT_PAGES_PER_DAY = 30;
const MIN_PAGES = 1;
const MAX_PAGES = 200;

interface Props {
  books: Book[];
}

export function ReadingPlanner({ books }: Props) {
  const [readingDays, setReadingDays] = useState<DayOfWeek[]>([0, 1, 2, 3, 4]);
  const [pagesPerDay, setPagesPerDay] = useState(DEFAULT_PAGES_PER_DAY);
  const [finishDate, setFinishDate] = useState("");
  const [method, setMethod] = useState<ReadingMethod>("sequential");
  // Ref (not state) so changes to direction don't themselves trigger the effect.
  const lastChangedRef = useRef<"pages" | "date">("pages");

  const totalPages = books.reduce(
    (sum, b) => sum + Math.max(0, b.page_count - (b.pages_read || 0)),
    0,
  );
  const today = todayISO();

  useEffect(() => {
    if (books.length === 0 || readingDays.length === 0) {
      setFinishDate("");
      return;
    }

    if (lastChangedRef.current === "pages") {
      const result = calculateSchedule(
        books,
        readingDays,
        pagesPerDay,
        method,
        today,
      );
      setFinishDate(result.finish_date);
    } else {
      if (!finishDate) return;
      const ppd = calculatePagesPerDay(
        totalPages,
        readingDays,
        today,
        finishDate,
      );
      if (ppd > 0) setPagesPerDay(ppd);
    }
  }, [books, readingDays, pagesPerDay, finishDate, method, today, totalPages]);

  const schedule: ScheduleResult | null =
    books.length > 0 && readingDays.length > 0 && pagesPerDay > 0
      ? calculateSchedule(books, readingDays, pagesPerDay, method, today)
      : null;

  const handlePagesChange = (value: number) => {
    lastChangedRef.current = "pages";
    setPagesPerDay(value);
  };

  const handleDateChange = (value: string) => {
    lastChangedRef.current = "date";
    setFinishDate(value);
  };

  const noDaysWarning = readingDays.length === 0;
  const dateTooSoonWarning =
    lastChangedRef.current === "date" && finishDate && finishDate < today;

  return (
    <div class="reading-planner">
      <section class="reading-planner__section">
        <p class="hon-section-title">
          <CalendarDays size={14} aria-hidden="true" />
          <span>Reading days</span>
        </p>
        <DayPicker selected={readingDays} onChange={setReadingDays} />
        {noDaysWarning && (
          <p class="reading-planner__warn" role="alert">
            Select at least one reading day.
          </p>
        )}
      </section>

      <hr class="hon-divider" />

      <section class="reading-planner__section">
        <div class="reading-planner__modes">
          <div class="reading-planner__mode">
            <label class="reading-planner__label" for="ppd-input">
              <Clock3 size={13} aria-hidden="true" />
              <span>Pages per day</span>
            </label>
            <div class="reading-planner__ppd">
              <input
                class="hon-input reading-planner__ppd-input hon-mono"
                id="ppd-input"
                type="number"
                min={MIN_PAGES}
                max={MAX_PAGES}
                value={pagesPerDay}
                onInput={(e) =>
                  handlePagesChange(
                    Math.max(
                      MIN_PAGES,
                      Number((e.target as HTMLInputElement).value),
                    ),
                  )
                }
                disabled={noDaysWarning || books.length === 0}
              />
              <input
                class="reading-planner__slider"
                type="range"
                min={MIN_PAGES}
                max={MAX_PAGES}
                value={pagesPerDay}
                onInput={(e) =>
                  handlePagesChange(
                    Number((e.target as HTMLInputElement).value),
                  )
                }
                aria-label="Pages per day slider"
                disabled={noDaysWarning || books.length === 0}
              />
            </div>
          </div>

          <div class="reading-planner__mode">
            <label class="reading-planner__label" for="finish-input">
              <CalendarDays size={13} aria-hidden="true" />
              <span>Finish by</span>
            </label>
            <input
              class="hon-input hon-mono reading-planner__date-input"
              id="finish-input"
              type="date"
              value={finishDate}
              min={today}
              onInput={(e) =>
                handleDateChange((e.target as HTMLInputElement).value)
              }
              disabled={noDaysWarning || books.length === 0}
            />
            {dateTooSoonWarning && (
              <p class="reading-planner__warn" role="alert">
                Date is in the past.
              </p>
            )}
          </div>
        </div>
      </section>

      <hr class="hon-divider" />

      <section class="reading-planner__section">
        <p class="hon-section-title">
          <Split size={14} aria-hidden="true" />
          <span>Reading method</span>
        </p>
        <fieldset
          class="reading-planner__method-group"
          aria-label="Reading method"
        >
          {(["sequential", "interleaved"] as ReadingMethod[]).map((m) => (
            <button
              key={m}
              type="button"
              class={`hon-btn reading-planner__method-btn${method === m ? " reading-planner__method-btn--active" : ""}`}
              aria-pressed={method === m ? "true" : "false"}
              onClick={() => setMethod(m)}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </fieldset>
        <p class="reading-planner__method-help">
          {method === "sequential"
            ? "Finish one book before starting the next. Your full daily page budget applies to the current book."
            : "Split your daily page budget across all active books. Larger books get a bigger share so everything finishes around the same time."}
        </p>
      </section>

      <hr class="hon-divider" />

      <section class="reading-planner__section">
        <p class="hon-section-title">
          <Route size={14} aria-hidden="true" />
          <span>Schedule</span>
        </p>
        {books.length === 0 ? (
          <p class="reading-planner__empty">Add books to get started.</p>
        ) : noDaysWarning ? (
          <p class="reading-planner__empty">
            Select reading days to see your schedule.
          </p>
        ) : schedule ? (
          <ScheduleView
            result={schedule}
            pagesPerDay={pagesPerDay}
            method={method}
          />
        ) : null}
      </section>
    </div>
  );
}
