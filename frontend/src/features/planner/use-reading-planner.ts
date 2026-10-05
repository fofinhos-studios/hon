import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { calculateSchedule, todayISO } from "../../domain/schedule";
import { targetsForDate } from "../../domain/schedule/targets";
import type { Book, DayOfWeek, ReadingMethod } from "../../types";

const DEFAULT_PAGES_PER_DAY = 30;
const DEFAULT_MINUTES_PER_DAY = 30;

export function normalizePagesPerDay(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1;
}

export function useReadingPlanner(books: Book[]) {
  const [readingDays, setReadingDays] = useState<DayOfWeek[]>([0, 1, 2, 3, 4]);
  const [pagesPerDay, setPagesPerDay] = useState(DEFAULT_PAGES_PER_DAY);
  const [minutesPerDay, setMinutesPerDay] = useState(DEFAULT_MINUTES_PER_DAY);
  const [finishDate, setFinishDate] = useState("");
  const [method, setMethod] = useState<ReadingMethod>("sequential");
  const [driver, setDriver] = useState<"pages" | "date">("pages");
  const dateBase = useRef({
    pages: DEFAULT_PAGES_PER_DAY,
    minutes: DEFAULT_MINUTES_PER_DAY,
  });
  const today = todayISO();
  // Visual enrichment replaces Book objects, but only order and page counts
  // affect the plan. Keep that input stable while images and colors arrive.
  const planKey = JSON.stringify(
    books.map((book) =>
      book.kind === "page"
        ? [book.id, book.kind, book.page_count, book.pages_read]
        : [book.id, book.kind, book.duration_minutes, book.minutes_listened],
    ),
  );
  const planInput = useRef({ key: planKey, books });
  if (planInput.current.key !== planKey)
    planInput.current = { key: planKey, books };
  const planBooks = planInput.current.books;
  const schedule = useMemo(
    () =>
      planBooks.length > 0 && readingDays.length > 0 && pagesPerDay > 0
        ? calculateSchedule(
            planBooks,
            readingDays,
            pagesPerDay,
            method,
            today,
            minutesPerDay,
          )
        : null,
    [planBooks, readingDays, pagesPerDay, minutesPerDay, method, today],
  );
  const hasPages = books.some((book) => book.kind === "page");
  const hasAudio = books.some((book) => book.kind === "audiobook");
  const required =
    driver === "date" && finishDate && finishDate >= today
      ? targetsForDate(
          planBooks,
          readingDays,
          today,
          finishDate,
          method,
          dateBase.current,
        )
      : null;
  const requiredPages = required?.pages ?? null;
  const requiredMinutes = required?.minutes ?? null;

  useEffect(() => {
    if (planBooks.length === 0 || readingDays.length === 0) {
      setFinishDate("");
      return;
    }
    if (driver === "pages") {
      if (schedule) setFinishDate(schedule.finish_date);
      return;
    }
    if (!finishDate) return;
    if (requiredPages !== null && requiredPages > 0)
      setPagesPerDay(requiredPages);
    if (requiredMinutes !== null && requiredMinutes > 0)
      setMinutesPerDay(requiredMinutes);
  }, [
    planBooks,
    readingDays,
    finishDate,
    driver,
    schedule,
    requiredPages,
    requiredMinutes,
  ]);

  return {
    readingDays,
    pagesPerDay,
    minutesPerDay,
    hasPages,
    hasAudio,
    finishDate,
    method,
    today,
    schedule,
    noDaysWarning: readingDays.length === 0,
    dateTooSoonWarning:
      driver === "date" && finishDate !== "" && finishDate < today,
    dateUnreachableWarning:
      driver === "date" &&
      finishDate !== "" &&
      finishDate >= today &&
      required === null,
    setReadingDays,
    setMethod,
    setPagesPerDay: (value: number) => {
      setDriver("pages");
      setPagesPerDay(normalizePagesPerDay(value));
    },
    setMinutesPerDay: (value: number) => {
      setDriver("pages");
      setMinutesPerDay(normalizePagesPerDay(value));
    },
    setFinishDate: (value: string) => {
      if (driver !== "date")
        dateBase.current = { pages: pagesPerDay, minutes: minutesPerDay };
      setDriver("date");
      setFinishDate(value);
    },
  };
}
