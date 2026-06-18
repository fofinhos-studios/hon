import type { DayOfWeek } from "../../types";

export function todayISO(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toISO(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseISO(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function dayOfWeek(date: Date): DayOfWeek {
  return ((date.getUTCDay() + 6) % 7) as DayOfWeek;
}

function addCalendarDays(date: Date, count: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + count);
  return result;
}

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
    if (daySet.has(dayOfWeek(current))) count += 1;
    current = addCalendarDays(current, 1);
  }
  return count;
}

export function addReadingDays(
  startISO: string,
  readingDays: DayOfWeek[],
  count: number,
): string {
  if (count <= 0) return startISO;
  if (readingDays.length === 0)
    throw new Error("readingDays must not be empty");
  const daySet = new Set(readingDays);
  let visited = 0;
  let current = parseISO(startISO);
  while (true) {
    if (daySet.has(dayOfWeek(current))) {
      visited += 1;
      if (visited === count) return toISO(current);
    }
    current = addCalendarDays(current, 1);
  }
}

export function firstReadingDay(
  startISO: string,
  readingDays: DayOfWeek[],
): string {
  return addReadingDays(startISO, readingDays, 1);
}

export function nextReadingDayAfter(
  dateISO: string,
  readingDays: DayOfWeek[],
): string {
  return firstReadingDay(
    toISO(addCalendarDays(parseISO(dateISO), 1)),
    readingDays,
  );
}
