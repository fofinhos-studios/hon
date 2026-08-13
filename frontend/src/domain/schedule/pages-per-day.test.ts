import { describe, expect, test } from "vitest";
import { calculatePagesPerDay } from "./pages-per-day";
import { EVERY_DAY, WEEKENDS, makeBook } from "./test-fixtures";

describe("pages per day", () => {
  test("rounds required pages up", () => {
    expect(
      calculatePagesPerDay(101, EVERY_DAY, "2026-01-05", "2026-01-14"),
    ).toBe(11);
  });

  test("returns zero without available reading days", () => {
    expect(
      calculatePagesPerDay(100, WEEKENDS, "2026-01-05", "2026-01-09"),
    ).toBe(0);
  });

  test("accounts for sequential per-book rounding", () => {
    expect(
      calculatePagesPerDay(
        [makeBook("a", 31), makeBook("b", 31), makeBook("c", 31)],
        EVERY_DAY,
        "2026-01-05",
        "2026-01-14",
        "sequential",
      ),
    ).toBe(11);
  });
});
