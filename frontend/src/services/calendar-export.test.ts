import "../test/setup";

import { afterEach, describe, expect, test, vi } from "vitest";
import { calculateSchedule } from "../domain/schedule";
import { makeBook } from "../domain/schedule/test-fixtures";
import {
  CalendarUrlTooLongError,
  createCalendarSnapshot,
  createCalendarUrl,
} from "./calendar-export";

afterEach(() => vi.unstubAllGlobals());

describe("calendar export snapshot", () => {
  test("stores book titles once and preserves each day's pages", () => {
    const schedule = calculateSchedule(
      [makeBook("first", 4), makeBook("second", 2)],
      [0, 2, 4],
      3,
      "interleaved",
      "2026-01-06",
    );
    const snapshot = createCalendarSnapshot(schedule, "pt-BR");
    expect(snapshot.locale).toBe("pt-BR");
    expect(snapshot.start_date).toBe("2026-01-07");
    expect(snapshot.books).toEqual(["first", "second"]);
    expect(snapshot.events).toEqual([
      [0, 0, 2],
      [0, 1, 1],
      [2, 0, 2],
      [2, 1, 1],
    ]);
  });

  test("makes a portable plain URL when compression is unavailable", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    const schedule = calculateSchedule(
      [makeBook("first", 5)],
      [0, 1, 2, 3, 4, 5, 6],
      5,
      "sequential",
      "2026-01-05",
    );
    const snapshot = createCalendarSnapshot(schedule, "en");
    const url = new URL(
      await createCalendarUrl(snapshot, "https://hon.fofinhos.studio"),
    );
    expect(url.pathname).toBe("/api/calendar/ics");
    expect(url.searchParams.get("encoding")).toBe("plain");
    const payload = url.searchParams.get("payload");
    if (!payload) throw new Error("Expected calendar payload");
    const bytes = Uint8Array.from(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
      (character) => character.charCodeAt(0),
    );
    expect(JSON.parse(new TextDecoder().decode(bytes))).toEqual(snapshot);
  });

  test("rejects a URL above 8 KB", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    const schedule = calculateSchedule(
      [makeBook("first", 5)],
      [0, 1, 2, 3, 4, 5, 6],
      5,
      "sequential",
      "2026-01-05",
    );
    schedule.books[0].book.title = "A".repeat(7000);
    await expect(
      createCalendarUrl(
        createCalendarSnapshot(schedule, "en"),
        "https://hon.fofinhos.studio",
      ),
    ).rejects.toBeInstanceOf(CalendarUrlTooLongError);
  });
});
