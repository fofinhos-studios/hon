import type {
  Book,
  BookSchedule,
  DayOfWeek,
  ReadingSession,
  ScheduleResult,
} from "../../types";
import {
  remainingUnits,
  totalRemainingMinutes,
  totalRemainingPages,
} from "./book-progress";
import { firstReadingDay, nextReadingDayAfter } from "./dates";

function allocateWeightedPages(remaining: number[], budget: number): number[] {
  const total = remaining.reduce((sum, pages) => sum + pages, 0);
  const dayBudget = Math.min(budget, total);
  const shares = remaining.map((pages) => (dayBudget * pages) / total);
  const allocations = shares.map((share, index) =>
    Math.min(remaining[index], Math.floor(share)),
  );
  let assigned = allocations.reduce((sum, pages) => sum + pages, 0);
  while (assigned < dayBudget) {
    const next = shares
      .map((share, index) => ({
        index,
        remainder: share - allocations[index],
        remaining: remaining[index] - allocations[index],
      }))
      .filter((entry) => entry.remaining > 0)
      .sort(
        (a, b) =>
          b.remainder - a.remainder ||
          b.remaining - a.remaining ||
          a.index - b.index,
      )[0]?.index;
    if (next === undefined) break;
    allocations[next] += 1;
    assigned += 1;
  }
  return allocations;
}

export function calculateInterleavedSchedule(
  books: Book[],
  readingDays: DayOfWeek[],
  pagesPerDay: number,
  startDateISO: string,
  minutesPerDay = 30,
): ScheduleResult {
  const firstDay = firstReadingDay(startDateISO, readingDays);
  const sessions: ReadingSession[] = [];
  const states = books.map((book) => ({
    book,
    remaining: remainingUnits(book),
    startDate: "",
    finishDate: "",
    assignedUnits: 0,
    readingDays: 0,
  }));
  let currentDay = firstDay;
  let readingDayCount = 0;

  while (states.some((state) => state.remaining > 0)) {
    const active = states.flatMap((state, index) =>
      state.remaining > 0 ? [index] : [],
    );
    const allocations = new Map<number, number>();
    for (const kind of ["page", "audiobook"] as const) {
      const matching = active.filter(
        (index) => states[index].book.kind === kind,
      );
      const shares = allocateWeightedPages(
        matching.map((index) => states[index].remaining),
        kind === "page" ? pagesPerDay : minutesPerDay,
      );
      matching.forEach((index, position) =>
        allocations.set(index, shares[position] ?? 0),
      );
    }
    for (const stateIndex of active) {
      const allocation = allocations.get(stateIndex) ?? 0;
      if (allocation <= 0) continue;
      const state = states[stateIndex];
      sessions.push(
        state.book.kind === "page"
          ? {
              date: currentDay,
              book_id: state.book.id,
              kind: "page",
              pages: allocation,
            }
          : {
              date: currentDay,
              book_id: state.book.id,
              kind: "audiobook",
              minutes: allocation,
            },
      );
      state.startDate ||= currentDay;
      state.remaining -= allocation;
      state.assignedUnits += allocation;
      state.readingDays += 1;
      state.finishDate = currentDay;
    }
    readingDayCount += 1;
    if (states.every((state) => state.remaining === 0)) break;
    currentDay = nextReadingDayAfter(currentDay, readingDays);
  }

  const schedules: BookSchedule[] = states.map((state) => ({
    book: state.book,
    start_date: state.startDate || firstDay,
    finish_date: state.finishDate || firstDay,
    ...(state.readingDays > 0
      ? state.book.kind === "page"
        ? { daily_pages: Math.round(state.assignedUnits / state.readingDays) }
        : { daily_minutes: Math.round(state.assignedUnits / state.readingDays) }
      : {}),
  }));
  return {
    books: schedules,
    sessions,
    total_pages: totalRemainingPages(books),
    total_minutes: totalRemainingMinutes(books),
    total_reading_days: readingDayCount,
    finish_date: schedules.reduce(
      (latest, schedule) =>
        schedule.finish_date > latest ? schedule.finish_date : latest,
      firstDay,
    ),
  };
}
