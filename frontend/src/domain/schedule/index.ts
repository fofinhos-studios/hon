import type {
  Book,
  DayOfWeek,
  ReadingMethod,
  ScheduleResult,
} from "../../types";
import { calculateInterleavedSchedule } from "./interleaved";
import { calculateSequentialSchedule } from "./sequential";

export { addReadingDays, countReadingDays, todayISO } from "./dates";
export { calculatePagesPerDay } from "./pages-per-day";

export function calculateSchedule(
  books: Book[],
  readingDays: DayOfWeek[],
  pagesPerDay: number,
  method: ReadingMethod,
  startDateISO: string,
): ScheduleResult {
  if (books.length === 0 || readingDays.length === 0 || pagesPerDay <= 0) {
    return {
      books: [],
      total_pages: 0,
      total_reading_days: 0,
      finish_date: startDateISO,
    };
  }
  return method === "interleaved"
    ? calculateInterleavedSchedule(
        books,
        readingDays,
        pagesPerDay,
        startDateISO,
      )
    : calculateSequentialSchedule(
        books,
        readingDays,
        pagesPerDay,
        startDateISO,
      );
}
