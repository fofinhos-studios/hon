import { describe, expect, test } from "bun:test";
import type { Book, DayOfWeek } from "../types";
import {
  addReadingDays,
  calculatePagesPerDay,
  calculateSchedule,
  countReadingDays,
  todayISO,
} from "./scheduler";

const EVERY_DAY: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS: DayOfWeek[] = [0, 1, 2, 3, 4];
const WEEKENDS: DayOfWeek[] = [5, 6];

function makeBook(id: string, pages: number): Book {
  return { id, title: id, author: "Test", page_count: pages, cover_url: null };
}

describe("countReadingDays", () => {
  test("counts inclusive on both ends", () => {
    expect(countReadingDays("2026-01-05", "2026-01-09", EVERY_DAY)).toBe(5);
  });

  test("single day counts as 1", () => {
    expect(countReadingDays("2026-01-05", "2026-01-05", EVERY_DAY)).toBe(1);
  });

  test("skips non-reading days", () => {
    expect(countReadingDays("2026-01-05", "2026-01-11", WEEKDAYS)).toBe(5);
  });

  test("returns 0 when no reading days in range", () => {
    expect(countReadingDays("2026-01-05", "2026-01-09", WEEKENDS)).toBe(0);
  });
});

describe("addReadingDays", () => {
  test("n=1 returns the start date when it is a reading day", () => {
    expect(addReadingDays("2026-01-05", EVERY_DAY, 1)).toBe("2026-01-05");
  });

  test("n=1 skips to next reading day when start is not a reading day", () => {
    expect(addReadingDays("2026-01-05", WEEKENDS, 1)).toBe("2026-01-10");
  });

  test("advances by N reading days", () => {
    expect(addReadingDays("2026-01-05", WEEKDAYS, 5)).toBe("2026-01-09");
  });

  test("crosses week boundaries correctly", () => {
    expect(addReadingDays("2026-01-05", WEEKDAYS, 7)).toBe("2026-01-13");
  });
});

describe("calculateSchedule sequential", () => {
  test("single book: finish date is ceil(pages/ppd) reading days from start", () => {
    const books = [makeBook("a", 100)];
    const result = calculateSchedule(
      books,
      EVERY_DAY,
      10,
      "sequential",
      "2026-01-05",
    );
    expect(result.books).toHaveLength(1);
    expect(result.books[0].start_date).toBe("2026-01-05");
    expect(result.books[0].finish_date).toBe("2026-01-14");
    expect(result.total_pages).toBe(100);
    expect(result.total_reading_days).toBe(10);
  });

  test("two books: second starts the reading day after first finishes", () => {
    const books = [makeBook("a", 50), makeBook("b", 50)];
    const result = calculateSchedule(
      books,
      EVERY_DAY,
      50,
      "sequential",
      "2026-01-05",
    );
    expect(result.books[0].start_date).toBe("2026-01-05");
    expect(result.books[0].finish_date).toBe("2026-01-05");
    expect(result.books[1].start_date).toBe("2026-01-06");
    expect(result.books[1].finish_date).toBe("2026-01-06");
  });

  test("skips non-reading days between books", () => {
    const books = [makeBook("a", 50), makeBook("b", 50)];
    const result = calculateSchedule(
      books,
      WEEKDAYS,
      50,
      "sequential",
      "2026-01-05",
    );
    expect(result.books[0].finish_date).toBe("2026-01-05");
    expect(result.books[1].start_date).toBe("2026-01-06");
  });

  test("fractional pages rounds up days", () => {
    const books = [makeBook("a", 101)];
    const result = calculateSchedule(
      books,
      EVERY_DAY,
      10,
      "sequential",
      "2026-01-05",
    );
    expect(result.total_reading_days).toBe(11);
  });

  test("with pages read: finish date is ceil(remaining_pages/ppd) reading days from start", () => {
    const book = makeBook("a", 100);
    book.pages_read = 60; // 40 pages remaining
    const result = calculateSchedule(
      [book],
      EVERY_DAY,
      10,
      "sequential",
      "2026-01-05",
    );
    expect(result.books[0].start_date).toBe("2026-01-05");
    expect(result.books[0].finish_date).toBe("2026-01-08"); // 4 days inclusive
    expect(result.total_pages).toBe(40);
    expect(result.total_reading_days).toBe(4);
  });

  test("completed book does not consume days and doesn't advance next book start", () => {
    const bookA = makeBook("a", 100);
    bookA.pages_read = 100; // completed
    const bookB = makeBook("b", 50); // 50 pages remaining
    const result = calculateSchedule(
      [bookA, bookB],
      EVERY_DAY,
      10,
      "sequential",
      "2026-01-05",
    );

    expect(result.books[0].start_date).toBe("2026-01-05");
    expect(result.books[0].finish_date).toBe("2026-01-05");
    expect(result.books[1].start_date).toBe("2026-01-05");
    expect(result.books[1].finish_date).toBe("2026-01-09"); // 5 reading days
    expect(result.total_pages).toBe(50);
    expect(result.total_reading_days).toBe(5);
  });
});

describe("calculateSchedule interleaved", () => {
  test("all books share the same start and finish date", () => {
    const books = [makeBook("a", 100), makeBook("b", 100)];
    const result = calculateSchedule(
      books,
      EVERY_DAY,
      20,
      "interleaved",
      "2026-01-05",
    );
    expect(result.books[0].start_date).toBe("2026-01-05");
    expect(result.books[1].start_date).toBe("2026-01-05");
    expect(result.books[0].finish_date).toBe(result.books[1].finish_date);
    expect(result.total_pages).toBe(200);
  });

  test("treats pages per day as a shared weighted budget across books", () => {
    const books = [makeBook("short", 100), makeBook("long", 200)];
    const result = calculateSchedule(
      books,
      EVERY_DAY,
      30,
      "interleaved",
      "2026-01-05",
    );

    expect(result.total_pages).toBe(300);
    expect(result.total_reading_days).toBe(10);
    expect(result.finish_date).toBe("2026-01-14");
    expect((result.books[0] as { daily_pages?: number }).daily_pages).toBe(10);
    expect((result.books[1] as { daily_pages?: number }).daily_pages).toBe(20);
  });

  test("with pages read: remaining pages are allocated correctly", () => {
    const bookA = makeBook("a", 100);
    bookA.pages_read = 50; // 50 remaining
    const bookB = makeBook("b", 100); // 100 remaining
    const result = calculateSchedule(
      [bookA, bookB],
      EVERY_DAY,
      30,
      "interleaved",
      "2026-01-05",
    );

    expect(result.total_pages).toBe(150);
    expect(result.total_reading_days).toBe(5);
    expect(result.finish_date).toBe("2026-01-09");
    expect((result.books[0] as { daily_pages?: number }).daily_pages).toBe(10);
    expect((result.books[1] as { daily_pages?: number }).daily_pages).toBe(20);
  });
});

describe("calculatePagesPerDay", () => {
  test("divides total pages by available reading days (rounds up)", () => {
    const ppd = calculatePagesPerDay(
      100,
      EVERY_DAY,
      "2026-01-05",
      "2026-01-14",
    );
    expect(ppd).toBe(10);
  });

  test("rounds up for fractional result", () => {
    const ppd = calculatePagesPerDay(
      101,
      EVERY_DAY,
      "2026-01-05",
      "2026-01-14",
    );
    expect(ppd).toBe(11);
  });

  test("returns 0 when no reading days in range", () => {
    const ppd = calculatePagesPerDay(100, WEEKENDS, "2026-01-05", "2026-01-09");
    expect(ppd).toBe(0);
  });
});
