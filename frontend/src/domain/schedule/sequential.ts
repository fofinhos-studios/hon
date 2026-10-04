import type {
  Book,
  BookSchedule,
  DayOfWeek,
  ReadingSession,
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
  const sessions: ReadingSession[] = [];
  let currentStart = firstReadingDay(startDateISO, readingDays);
  let lastActiveFinish: string | null = null;

  for (const book of books) {
    const remaining = remainingPages(book);
    const daysNeeded = Math.ceil(remaining / pagesPerDay);
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
      let day = currentStart;
      for (let index = 0; index < daysNeeded; index += 1) {
        sessions.push({
          date: day,
          book_id: book.id,
          pages: Math.min(pagesPerDay, remaining - index * pagesPerDay),
        });
        if (index < daysNeeded - 1) day = nextReadingDayAfter(day, readingDays);
      }
      lastActiveFinish = finish;
      currentStart = nextReadingDayAfter(finish, readingDays);
    }
  }

  return {
    books: schedules,
    sessions,
    total_pages: totalRemainingPages(books),
    total_reading_days: books.reduce(
      (sum, book) => sum + Math.ceil(remainingPages(book) / pagesPerDay),
      0,
    ),
    finish_date: lastActiveFinish ?? currentStart,
  };
}
