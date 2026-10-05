import { describe, expect, test } from "vitest";
import { calculateSchedule } from ".";
import { targetsForDate } from "./targets";
import { EVERY_DAY, makeAudiobook, makeBook } from "./test-fixtures";

describe("mixed finish-date targets", () => {
  test("scales both daily targets at their current ratio", () => {
    const books = [makeBook("print", 100), makeAudiobook("audio", 200)];
    const targets = targetsForDate(
      books,
      EVERY_DAY,
      "2026-01-05",
      "2026-01-06",
      "interleaved",
      { pages: 10, minutes: 20 },
    );
    expect(targets).toEqual({ pages: 50, minutes: 100 });
    if (!targets) throw new Error("Expected feasible daily targets");
    expect(
      calculateSchedule(
        books,
        EVERY_DAY,
        targets.pages,
        "interleaved",
        "2026-01-05",
        targets.minutes,
      ).finish_date,
    ).toBe("2026-01-06");
  });

  test("reports an impossible sequential date even with unlimited speed", () => {
    const books = [makeBook("print", 1), makeAudiobook("audio", 1)];
    expect(
      targetsForDate(
        books,
        EVERY_DAY,
        "2026-01-05",
        "2026-01-05",
        "sequential",
        { pages: 10, minutes: 20 },
      ),
    ).toBeNull();
  });
});
