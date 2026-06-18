import { useEffect, useState } from "preact/hooks";
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

  useEffect(() => {
    if (books.length === 0 || readingDays.length === 0) {
      setFinishDate("");
      return;
    }
    if (driver === "pages") {
      setFinishDate(
        calculateSchedule(books, readingDays, pagesPerDay, method, today)
          .finish_date,
      );
      return;
    }
    if (!finishDate) return;
    const required = calculatePagesPerDay(
      books,
      readingDays,
      today,
      finishDate,
      method,
    );
    if (required > 0) setPagesPerDay(required);
  }, [books, readingDays, pagesPerDay, finishDate, method, driver, today]);

  return {
    readingDays,
    pagesPerDay,
    finishDate,
    method,
    today,
    schedule:
      books.length > 0 && readingDays.length > 0 && pagesPerDay > 0
        ? calculateSchedule(books, readingDays, pagesPerDay, method, today)
        : null,
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
