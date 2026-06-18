import { describe, expect, test } from "bun:test";
import { calculateSchedule } from ".";
import { EVERY_DAY, makeBook } from "./test-fixtures";

describe("schedule public API", () => {
  test("dispatches schedule method", () => {
    const sequential = calculateSchedule(
      [makeBook("a", 100), makeBook("b", 100)],
      EVERY_DAY,
      20,
      "sequential",
      "2026-01-05",
    );
    const interleaved = calculateSchedule(
      [makeBook("a", 100), makeBook("b", 100)],
      EVERY_DAY,
      20,
      "interleaved",
      "2026-01-05",
    );
    expect(sequential.books[1].start_date).not.toBe(
      interleaved.books[1].start_date,
    );
  });

  test("returns empty result for invalid inputs", () => {
    expect(
      calculateSchedule([], EVERY_DAY, 20, "sequential", "2026-01-05"),
    ).toEqual({
      books: [],
      total_pages: 0,
      total_reading_days: 0,
      finish_date: "2026-01-05",
    });
  });
});
