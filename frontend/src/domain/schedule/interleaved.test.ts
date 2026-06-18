import { describe, expect, test } from "bun:test";
import { calculateInterleavedSchedule } from "./interleaved";
import { EVERY_DAY, makeBook } from "./test-fixtures";

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
});
