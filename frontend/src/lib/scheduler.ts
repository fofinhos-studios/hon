import type {
  Book,
  BookSchedule,
  DayOfWeek,
  ReadingMethod,
  ScheduleResult,
} from "../types";

// ── Date utilities ────────────────────────────────────────────────────────────

/** ISO YYYY-MM-DD for today (local time) */
export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Convert a UTC Date to ISO YYYY-MM-DD string */
function toISO(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse ISO date string to a UTC Date (avoids local timezone shift) */
function parseISO(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/**
 * Get our day-of-week (0=Mon…6=Sun) from a Date.
 * JS Date.getUTCDay() returns 0=Sun, 1=Mon…6=Sat.
 */
function ourDayOfWeek(d: Date): DayOfWeek {
  return ((d.getUTCDay() + 6) % 7) as DayOfWeek;
}

/** Advance a Date by N calendar days */
function addCalendarDays(d: Date, n: number): Date {
  const result = new Date(d.getTime());
  result.setUTCDate(result.getUTCDate() + n);
  return result;
}

// ── Core schedule functions ───────────────────────────────────────────────────

/**
 * Count reading days in [startISO, endISO] inclusive.
 */
export function countReadingDays(
  startISO: string,
  endISO: string,
  readingDays: DayOfWeek[],
): number {
  const daySet = new Set(readingDays);
  let count = 0;
  let current = parseISO(startISO);
  const end = parseISO(endISO);
  while (current <= end) {
    if (daySet.has(ourDayOfWeek(current))) {
      count++;
    }
    current = addCalendarDays(current, 1);
  }
  return count;
}

/**
 * Return the ISO date of the Nth reading day at or after startISO.
 * N is 1-indexed: n=1 returns the first reading day on or after startISO.
 */
export function addReadingDays(
  startISO: string,
  readingDays: DayOfWeek[],
  n: number,
): string {
  if (n <= 0) return startISO;
  if (readingDays.length === 0) throw new Error("readingDays must not be empty");
  const daySet = new Set(readingDays);
  let count = 0;
  let current = parseISO(startISO);
  while (true) {
    if (daySet.has(ourDayOfWeek(current))) {
      count++;
      if (count === n) return toISO(current);
    }
    current = addCalendarDays(current, 1);
  }
}

/**
 * Return the ISO date of the first reading day on or after startISO.
 */
function firstReadingDay(startISO: string, readingDays: DayOfWeek[]): string {
  return addReadingDays(startISO, readingDays, 1);
}

/**
 * Return the ISO date of the next reading day STRICTLY AFTER afterISO.
 */
function nextReadingDayAfter(
  afterISO: string,
  readingDays: DayOfWeek[],
): string {
  const next = toISO(addCalendarDays(parseISO(afterISO), 1));
  return firstReadingDay(next, readingDays);
}

function allocateWeightedPages(
  remainingPages: number[],
  budget: number,
): number[] {
  const totalRemaining = remainingPages.reduce((sum, pages) => sum + pages, 0);
  const dayBudget = Math.min(budget, totalRemaining);
  const exactShares = remainingPages.map(
    (pages) => (dayBudget * pages) / totalRemaining,
  );
  const allocations = exactShares.map((share, index) =>
    Math.min(remainingPages[index], Math.floor(share)),
  );

  let assigned = allocations.reduce((sum, pages) => sum + pages, 0);
  while (assigned < dayBudget) {
    const nextIndex = exactShares
      .map((share, index) => ({
        index,
        remainder: share - allocations[index],
        remaining: remainingPages[index] - allocations[index],
      }))
      .filter((entry) => entry.remaining > 0)
      .sort(
        (a, b) =>
          b.remainder - a.remainder ||
          b.remaining - a.remaining ||
          a.index - b.index,
      )[0]?.index;

    if (nextIndex === undefined) break;
    allocations[nextIndex] += 1;
    assigned += 1;
  }

  return allocations;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Given pages/day, compute the full schedule.
 * Returns an empty result if readingDays is empty, books is empty, or pagesPerDay <= 0.
 */
export function calculateSchedule(
  books: Book[],
  readingDays: DayOfWeek[],
  pagesPerDay: number,
  method: ReadingMethod,
  startDateISO: string,
): ScheduleResult {
  const empty: ScheduleResult = {
    books: [],
    total_pages: 0,
    total_reading_days: 0,
    finish_date: startDateISO,
  };

  if (books.length === 0 || readingDays.length === 0 || pagesPerDay <= 0) {
    return empty;
  }

  const totalPages = books.reduce((sum, b) => sum + b.page_count, 0);
  const totalReadingDays = Math.ceil(totalPages / pagesPerDay);

  if (method === "interleaved") {
    const firstDay = firstReadingDay(startDateISO, readingDays);
    const states = books.map((book) => ({
      book,
      remaining: book.page_count,
      start_date: "",
      finish_date: "",
      pages_read: 0,
      reading_days_used: 0,
    }));

    let currentDay = firstDay;
    let readingDayCount = 0;

    while (states.some((state) => state.remaining > 0)) {
      const activeIndices = states.flatMap((state, index) =>
        state.remaining > 0 ? [index] : [],
      );
      const allocations = allocateWeightedPages(
        activeIndices.map((index) => states[index].remaining),
        pagesPerDay,
      );

      activeIndices.forEach((stateIndex, allocationIndex) => {
        const allocation = allocations[allocationIndex] ?? 0;
        if (allocation <= 0) return;

        const state = states[stateIndex];
        if (!state.start_date) {
          state.start_date = currentDay;
        }
        state.remaining -= allocation;
        state.pages_read += allocation;
        state.reading_days_used += 1;
        state.finish_date = currentDay;
      });

      readingDayCount += 1;
      if (states.every((state) => state.remaining === 0)) break;
      currentDay = nextReadingDayAfter(currentDay, readingDays);
    }

    const bookSchedules: BookSchedule[] = states.map((state) => ({
      book: state.book,
      start_date: state.start_date || firstDay,
      finish_date: state.finish_date || firstDay,
      daily_pages:
        state.reading_days_used > 0
          ? Math.round(state.pages_read / state.reading_days_used)
          : undefined,
    }));
    const finish = bookSchedules.reduce(
      (latest, schedule) =>
        schedule.finish_date > latest ? schedule.finish_date : latest,
      firstDay,
    );

    return {
      books: bookSchedules,
      total_pages: totalPages,
      total_reading_days: readingDayCount,
      finish_date: finish,
    };
  }

  const bookSchedules: BookSchedule[] = [];
  let currentStart = firstReadingDay(startDateISO, readingDays);

  for (const book of books) {
    const daysNeeded = Math.ceil(book.page_count / pagesPerDay);
    const finish = addReadingDays(currentStart, readingDays, daysNeeded);
    bookSchedules.push({ book, start_date: currentStart, finish_date: finish });
    currentStart = nextReadingDayAfter(finish, readingDays);
  }

  // Sum per-book ceil'd days to stay consistent with the actual schedule dates.
  // Math.ceil is not distributive over addition, so re-using totalReadingDays
  // (computed from totalPages) could disagree with the span of bookSchedules.
  const actualTotalReadingDays = bookSchedules.reduce(
    (sum, bs) => sum + Math.ceil(bs.book.page_count / pagesPerDay),
    0,
  );
  const lastFinish =
    bookSchedules[bookSchedules.length - 1]?.finish_date ?? startDateISO;
  return {
    books: bookSchedules,
    total_pages: totalPages,
    total_reading_days: actualTotalReadingDays,
    finish_date: lastFinish,
  };
}

/**
 * Given a target finish date, compute required pages/day.
 * Returns 0 if there are no reading days in the range.
 */
export function calculatePagesPerDay(
  totalPages: number,
  readingDays: DayOfWeek[],
  startDateISO: string,
  finishDateISO: string,
): number {
  const available = countReadingDays(startDateISO, finishDateISO, readingDays);
  if (available === 0) return 0;
  return Math.ceil(totalPages / available);
}
