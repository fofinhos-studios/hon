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
  minutesPerDay = 30,
): ScheduleResult {
  if (
    books.length === 0 ||
    readingDays.length === 0 ||
    pagesPerDay <= 0 ||
    minutesPerDay <= 0
  ) {
    return {
      books: [],
      sessions: [],
      total_pages: 0,
      total_minutes: 0,
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
        minutesPerDay,
      )
    : calculateSequentialSchedule(
        books,
        readingDays,
        pagesPerDay,
        startDateISO,
        minutesPerDay,
      );
}
