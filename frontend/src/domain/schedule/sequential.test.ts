import { describe, expect, test } from "bun:test";
import { calculateSequentialSchedule } from "./sequential";
import { EVERY_DAY, makeBook } from "./test-fixtures";

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
  });
});
