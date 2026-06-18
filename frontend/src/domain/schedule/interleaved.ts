import type {
  Book,
  BookSchedule,
  DayOfWeek,
  ScheduleResult,
} from "../../types";
import { remainingPages, totalRemainingPages } from "./book-progress";
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
): ScheduleResult {
  const firstDay = firstReadingDay(startDateISO, readingDays);
  const states = books.map((book) => ({
    book,
    remaining: remainingPages(book),
    startDate: "",
    finishDate: "",
    assignedPages: 0,
    readingDays: 0,
  }));
  let currentDay = firstDay;
  let readingDayCount = 0;

  while (states.some((state) => state.remaining > 0)) {
    const active = states.flatMap((state, index) =>
      state.remaining > 0 ? [index] : [],
    );
    const allocations = allocateWeightedPages(
      active.map((index) => states[index].remaining),
      pagesPerDay,
    );
    active.forEach((stateIndex, allocationIndex) => {
      const allocation = allocations[allocationIndex] ?? 0;
      if (allocation <= 0) return;
      const state = states[stateIndex];
      state.startDate ||= currentDay;
      state.remaining -= allocation;
      state.assignedPages += allocation;
      state.readingDays += 1;
      state.finishDate = currentDay;
    });
    readingDayCount += 1;
    if (states.every((state) => state.remaining === 0)) break;
    currentDay = nextReadingDayAfter(currentDay, readingDays);
  }

  const schedules: BookSchedule[] = states.map((state) => ({
    book: state.book,
    start_date: state.startDate || firstDay,
    finish_date: state.finishDate || firstDay,
    daily_pages:
      state.readingDays > 0
        ? Math.round(state.assignedPages / state.readingDays)
        : undefined,
  }));
  return {
    books: schedules,
    total_pages: totalRemainingPages(books),
    total_reading_days: readingDayCount,
    finish_date: schedules.reduce(
      (latest, schedule) =>
        schedule.finish_date > latest ? schedule.finish_date : latest,
      firstDay,
    ),
  };
}
