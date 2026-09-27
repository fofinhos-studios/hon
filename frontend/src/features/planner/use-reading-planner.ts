import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  calculatePagesPerDay,
  calculateSchedule,
  todayISO,
} from "../../domain/schedule";
import type { Book, DayOfWeek, ReadingMethod } from "../../types";

const DEFAULT_PAGES_PER_DAY = 30;

export function normalizePagesPerDay(value: number): number {
  return Math.max(1, Math.round(value));
}

export function useReadingPlanner(books: Book[]) {
  const [readingDays, setReadingDays] = useState<DayOfWeek[]>([0, 1, 2, 3, 4]);
  const [pagesPerDay, setPagesPerDay] = useState(DEFAULT_PAGES_PER_DAY);
  const [finishDate, setFinishDate] = useState("");
  const [method, setMethod] = useState<ReadingMethod>("sequential");
  const [driver, setDriver] = useState<"pages" | "date">("pages");
  const today = todayISO();
  // Visual enrichment replaces Book objects, but only order and page counts
  // affect the plan. Keep that input stable while images and colors arrive.
  const planKey = JSON.stringify(
    books.map(({ id, page_count, pages_read }) => [id, page_count, pages_read]),
  );
  const planInput = useRef({ key: planKey, books });
  if (planInput.current.key !== planKey)
    planInput.current = { key: planKey, books };
  const planBooks = planInput.current.books;
  const schedule = useMemo(
    () =>
      planBooks.length > 0 && readingDays.length > 0 && pagesPerDay > 0
        ? calculateSchedule(planBooks, readingDays, pagesPerDay, method, today)
        : null,
    [planBooks, readingDays, pagesPerDay, method, today],
  );

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
    const required = calculatePagesPerDay(
      planBooks,
      readingDays,
      today,
      finishDate,
      method,
    );
    if (required > 0) setPagesPerDay(required);
  }, [planBooks, readingDays, finishDate, method, driver, today, schedule]);

  return {
    readingDays,
    pagesPerDay,
    finishDate,
    method,
    today,
    schedule,
    noDaysWarning: readingDays.length === 0,
    dateTooSoonWarning:
      driver === "date" && finishDate !== "" && finishDate < today,
    setReadingDays,
    setMethod,
    setPagesPerDay: (value: number) => {
      setDriver("pages");
      setPagesPerDay(normalizePagesPerDay(value));
    },
    setFinishDate: (value: string) => {
      setDriver("date");
      setFinishDate(value);
    },
  };
}
