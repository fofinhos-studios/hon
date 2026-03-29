// Day 0 = Monday, 1 = Tuesday, ..., 6 = Sunday
// JavaScript Date.getDay() uses 0=Sunday. Convert: ourDay = (jsDay + 6) % 7
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DAY_LABELS: Record<DayOfWeek, string> = {
  0: "Mo",
  1: "Tu",
  2: "We",
  3: "Th",
  4: "Fr",
  5: "Sa",
  6: "Su",
};

export const ALL_DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

export interface Book {
  id: string;
  title: string;
  author: string;
  page_count: number;
  cover_url: string | null;
}

export type ReadingMethod = "sequential" | "interleaved";

export interface BookSchedule {
  book: Book;
  start_date: string; // ISO YYYY-MM-DD
  finish_date: string; // ISO YYYY-MM-DD — last reading day for this book
}

export interface ScheduleResult {
  books: BookSchedule[];
  total_pages: number;
  total_reading_days: number;
  finish_date: string;
}
