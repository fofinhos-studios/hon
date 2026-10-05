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

export interface BookBase {
  id: string;
  title: string;
  author: string;
  cover_url: string | null;
  cover_fallback_url?: string | null;
  isbn?: string | null;
  language?: string | null;
  publisher?: string | null;
  published_date?: string | null;
  visuals?: BookVisuals;
  visuals_checked_at?: number;
  background_hidden?: boolean;
}

export interface PageBook extends BookBase {
  kind: "page";
  format: "physical" | "digital" | "unspecified";
  page_count: number;
  pages_read?: number;
}

export interface Audiobook extends BookBase {
  kind: "audiobook";
  duration_minutes: number;
  minutes_listened?: number;
  narrators: string[];
}

export type Book = PageBook | Audiobook;

interface SearchMetadata {
  source: string;
  work_key: string;
}

export type SearchBook =
  | (Omit<PageBook, "page_count"> &
      SearchMetadata & {
        page_count: number | null;
      })
  | (Omit<Audiobook, "duration_minutes"> &
      SearchMetadata & {
        duration_minutes: number | null;
      });

export interface BookVisuals {
  color_version?: number;
  dominant_color: string | null;
  artwork: {
    image_url: string;
    source_url: string;
    author: string;
    license: string;
  } | null;
}

export type ReadingMethod = "sequential" | "interleaved";

export interface BookSchedule {
  book: Book;
  start_date: string; // ISO YYYY-MM-DD
  finish_date: string; // ISO YYYY-MM-DD — last reading day for this book
  daily_pages?: number;
  daily_minutes?: number;
}

interface SessionBase {
  date: string; // ISO YYYY-MM-DD
  book_id: string;
}

export type ReadingSession =
  | (SessionBase & { kind: "page"; pages: number })
  | (SessionBase & { kind: "audiobook"; minutes: number });

export interface ScheduleResult {
  books: BookSchedule[];
  sessions: ReadingSession[];
  total_pages: number;
  total_minutes: number;
  total_reading_days: number;
  finish_date: string;
}
