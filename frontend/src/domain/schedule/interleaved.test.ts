import { describe, expect, test } from "vitest";
import { calculateInterleavedSchedule } from "./interleaved";
import { EVERY_DAY, makeAudiobook, makeBook } from "./test-fixtures";

describe("interleaved schedule", () => {
  test("shares weighted daily budget across active books", () => {
    const result = calculateInterleavedSchedule(
      [makeBook("short", 100), makeBook("long", 200)],
      EVERY_DAY,
      30,
      "2026-01-05",
    );
    expect(result.total_reading_days).toBe(10);
    expect(result.finish_date).toBe("2026-01-14");
    expect(result.books.map((book) => book.daily_pages)).toEqual([10, 20]);
  });

  test("allocates only remaining pages", () => {
    const result = calculateInterleavedSchedule(
      [makeBook("a", 100, 50), makeBook("b", 100)],
      EVERY_DAY,
      30,
      "2026-01-05",
    );
    expect(result.total_pages).toBe(150);
    expect(result.total_reading_days).toBe(5);
  });

  test("records each book's exact allocation on shared reading days", () => {
    const result = calculateInterleavedSchedule(
      [makeBook("first", 4), makeBook("second", 2)],
      [0, 2, 4],
      3,
      "2026-01-06",
    );
    expect(result.sessions).toEqual([
      { date: "2026-01-07", book_id: "first", kind: "page", pages: 2 },
      { date: "2026-01-07", book_id: "second", kind: "page", pages: 1 },
      { date: "2026-01-09", book_id: "first", kind: "page", pages: 2 },
      { date: "2026-01-09", book_id: "second", kind: "page", pages: 1 },
    ]);
    expect(
      result.sessions.reduce(
        (sum, session) => sum + (session.kind === "page" ? session.pages : 0),
        0,
      ),
    ).toBe(result.total_pages);
  });

  test("spends page and minute budgets independently on the same day", () => {
    const result = calculateInterleavedSchedule(
      [makeBook("print", 20), makeAudiobook("audio", 60)],
      EVERY_DAY,
      10,
      "2026-01-05",
      30,
    );
    expect(result.sessions).toEqual([
      { date: "2026-01-05", book_id: "print", kind: "page", pages: 10 },
      { date: "2026-01-05", book_id: "audio", kind: "audiobook", minutes: 30 },
      { date: "2026-01-06", book_id: "print", kind: "page", pages: 10 },
      { date: "2026-01-06", book_id: "audio", kind: "audiobook", minutes: 30 },
    ]);
    expect(result.total_reading_days).toBe(2);
    expect(result.total_pages).toBe(20);
    expect(result.total_minutes).toBe(60);
  });
});
