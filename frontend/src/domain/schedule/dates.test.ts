import { describe, expect, test } from "bun:test";
import { addReadingDays, countReadingDays } from "./dates";
import { EVERY_DAY, WEEKDAYS, WEEKENDS } from "./test-fixtures";

describe("schedule dates", () => {
  test("counts reading days inclusively", () => {
    expect(countReadingDays("2026-01-05", "2026-01-11", WEEKDAYS)).toBe(5);
    expect(countReadingDays("2026-01-05", "2026-01-09", WEEKENDS)).toBe(0);
  });

  test("adds reading days while skipping unavailable days", () => {
    expect(addReadingDays("2026-01-05", EVERY_DAY, 1)).toBe("2026-01-05");
    expect(addReadingDays("2026-01-05", WEEKENDS, 1)).toBe("2026-01-10");
    expect(addReadingDays("2026-01-05", WEEKDAYS, 7)).toBe("2026-01-13");
  });
});
