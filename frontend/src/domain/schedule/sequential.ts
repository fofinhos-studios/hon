import type {
  Book,
  BookSchedule,
  DayOfWeek,
  ScheduleResult,
} from "../../types";
import { remainingPages, totalRemainingPages } from "./book-progress";
import { addReadingDays, firstReadingDay, nextReadingDayAfter } from "./dates";

export function calculateSequentialSchedule(
  books: Book[],
  readingDays: DayOfWeek[],
  pagesPerDay: number,
  startDateISO: string,
): ScheduleResult {
  const schedules: BookSchedule[] = [];
  let currentStart = firstReadingDay(startDateISO, readingDays);
  let lastActiveFinish: string | null = null;

  for (const book of books) {
    const daysNeeded = Math.ceil(remainingPages(book) / pagesPerDay);
    const finish: string =
      daysNeeded > 0
        ? addReadingDays(currentStart, readingDays, daysNeeded)
        : (lastActiveFinish ?? currentStart);
    schedules.push({
      book,
      start_date: daysNeeded > 0 ? currentStart : finish,
      finish_date: finish,
    });
    if (daysNeeded > 0) {
      lastActiveFinish = finish;
      currentStart = nextReadingDayAfter(finish, readingDays);
    }
  }

  return {
    books: schedules,
    total_pages: totalRemainingPages(books),
    total_reading_days: books.reduce(
      (sum, book) => sum + Math.ceil(remainingPages(book) / pagesPerDay),
      0,
    ),
    finish_date: lastActiveFinish ?? currentStart,
  };
}
