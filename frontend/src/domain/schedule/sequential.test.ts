import { describe, expect, test } from "vitest";
import { calculateSequentialSchedule } from "./sequential";
import { EVERY_DAY, makeAudiobook, makeBook } from "./test-fixtures";

describe("sequential schedule", () => {
  test("schedules books one after another", () => {
    const result = calculateSequentialSchedule(
      [makeBook("a", 50), makeBook("b", 50)],
      EVERY_DAY,
      50,
      "2026-01-05",
    );
    expect(result.books.map((book) => book.finish_date)).toEqual([
      "2026-01-05",
      "2026-01-06",
    ]);
  });

  test("uses remaining pages and ignores completed trailing books", () => {
    const result = calculateSequentialSchedule(
      [makeBook("active", 100, 50), makeBook("done", 100, 100)],
      EVERY_DAY,
      50,
      "2026-01-05",
    );
    expect(result.total_pages).toBe(50);
    expect(result.total_reading_days).toBe(1);
    expect(result.finish_date).toBe("2026-01-05");
    expect(result.sessions).toEqual([
      { date: "2026-01-05", book_id: "active", kind: "page", pages: 50 },
    ]);
  });

  test("assigns exact final-day pages only on selected weekdays", () => {
    const result = calculateSequentialSchedule(
      [
        makeBook("first", 65, 5),
        makeBook("done", 30, 30),
        makeBook("second", 15),
      ],
      [0, 2, 4],
      25,
      "2026-01-06",
    );
    expect(result.sessions).toEqual([
      { date: "2026-01-07", book_id: "first", kind: "page", pages: 25 },
      { date: "2026-01-09", book_id: "first", kind: "page", pages: 25 },
      { date: "2026-01-12", book_id: "first", kind: "page", pages: 10 },
      { date: "2026-01-14", book_id: "second", kind: "page", pages: 15 },
    ]);
  });

  test("uses one global queue while preserving both units", () => {
    const result = calculateSequentialSchedule(
      [
        makeBook("print", 60, 10),
        makeAudiobook("audio", 100, 40),
        makeBook("ebook", 25),
      ],
      EVERY_DAY,
      25,
      "2026-01-05",
      30,
    );
    expect(result.sessions).toEqual([
      { date: "2026-01-05", book_id: "print", kind: "page", pages: 25 },
      { date: "2026-01-06", book_id: "print", kind: "page", pages: 25 },
      { date: "2026-01-07", book_id: "audio", kind: "audiobook", minutes: 30 },
      { date: "2026-01-08", book_id: "audio", kind: "audiobook", minutes: 30 },
      { date: "2026-01-09", book_id: "ebook", kind: "page", pages: 25 },
    ]);
    expect(result.total_pages).toBe(75);
    expect(result.total_minutes).toBe(60);
    expect(result.finish_date).toBe("2026-01-09");
  });
});
