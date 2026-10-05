import type { Book, DayOfWeek, ReadingMethod } from "../../types";
import { remainingUnits } from "./book-progress";
import { countReadingDays } from "./dates";
import { calculateSchedule } from "./index";
import { calculatePagesPerDay } from "./pages-per-day";

export interface DailyTargets {
  pages: number;
  minutes: number;
}

export function targetsForDate(
  books: Book[],
  readingDays: DayOfWeek[],
  startDate: string,
  finishDate: string,
  method: ReadingMethod,
  base: DailyTargets,
): DailyTargets | null {
  const available = countReadingDays(startDate, finishDate, readingDays);
  const active = books.filter((book) => remainingUnits(book) > 0);
  if (active.length === 0) return base;
  if (available === 0 || (method === "sequential" && active.length > available))
    return null;
  const pageBooks = active.filter((book) => book.kind === "page");
  const audioBooks = active.filter((book) => book.kind === "audiobook");
  if (audioBooks.length === 0)
    return {
      pages: calculatePagesPerDay(
        pageBooks,
        readingDays,
        startDate,
        finishDate,
        method,
      ),
      minutes: base.minutes,
    };
  if (pageBooks.length === 0) {
    const total = audioBooks.reduce(
      (sum, book) => sum + remainingUnits(book),
      0,
    );
    let minutes = Math.max(1, Math.ceil(total / available));
    while (
      calculateSchedule(books, readingDays, 1, method, startDate, minutes)
        .finish_date > finishDate
    )
      minutes += 1;
    return { pages: base.pages, minutes };
  }
  const pair = (scale: number): DailyTargets => ({
    pages: Math.max(1, Math.ceil(base.pages * scale)),
    minutes: Math.max(1, Math.ceil(base.minutes * scale)),
  });
  const meets = (scale: number): boolean => {
    const targets = pair(scale);
    return (
      calculateSchedule(
        books,
        readingDays,
        targets.pages,
        method,
        startDate,
        targets.minutes,
      ).finish_date <= finishDate
    );
  };
  let high = 1;
  while (!meets(high)) high *= 2;
  let low = 0;
  for (let step = 0; step < 32; step += 1) {
    const middle = (low + high) / 2;
    if (meets(middle)) high = middle;
    else low = middle;
  }
  return pair(high);
}
