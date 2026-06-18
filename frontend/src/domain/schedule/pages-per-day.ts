import type { Book, DayOfWeek, ReadingMethod } from "../../types";
import { remainingPages, totalRemainingPages } from "./book-progress";
import { countReadingDays } from "./dates";

export function calculatePagesPerDay(
  booksOrPages: Book[] | number,
  readingDays: DayOfWeek[],
  startDateISO: string,
  finishDateISO: string,
  method: ReadingMethod = "interleaved",
): number {
  const available = countReadingDays(startDateISO, finishDateISO, readingDays);
  if (available === 0) return 0;
  const total =
    typeof booksOrPages === "number"
      ? booksOrPages
      : totalRemainingPages(booksOrPages);
  if (method === "interleaved" || typeof booksOrPages === "number") {
    return Math.ceil(total / available);
  }
  let pagesPerDay = Math.ceil(total / available);
  if (pagesPerDay <= 0) return 0;
  while (
    booksOrPages.reduce(
      (sum, book) => sum + Math.ceil(remainingPages(book) / pagesPerDay),
      0,
    ) > available
  ) {
    pagesPerDay += 1;
  }
  return pagesPerDay;
}
