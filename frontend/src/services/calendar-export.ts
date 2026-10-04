import type { Locale } from "../i18n";
import type { ScheduleResult } from "../types";

export interface CalendarSnapshot {
  v: 1;
  locale: Locale;
  created_at: string;
  start_date: string;
  books: string[];
  events: [dayOffset: number, bookIndex: number, pages: number][];
}

export const MAX_CALENDAR_URL_LENGTH = 8192;

export class CalendarUrlTooLongError extends Error {}

export function createCalendarSnapshot(
  result: ScheduleResult,
  locale: Locale,
): CalendarSnapshot {
  const usedIds = new Set(result.sessions.map((session) => session.book_id));
  const books = result.books.filter(({ book }) => usedIds.has(book.id));
  const indices = new Map(books.map(({ book }, index) => [book.id, index]));
  const startDate = result.sessions.reduce(
    (first, session) =>
      first === "" || session.date < first ? session.date : first,
    "",
  );
  const startMillis = Date.parse(`${startDate}T00:00:00Z`);

  return {
    v: 1,
    locale,
    created_at: new Date().toISOString(),
    start_date: startDate,
    books: books.map(({ book }) => book.title),
    events: result.sessions.map((session) => {
      const bookIndex = indices.get(session.book_id);
      if (bookIndex === undefined) throw new Error("Session book is missing");
      return [
        Math.round(
          (Date.parse(`${session.date}T00:00:00Z`) - startMillis) / 86_400_000,
        ),
        bookIndex,
        session.pages,
      ];
    }),
  };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function compressedBytes(value: string): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([value])
      .stream()
      .pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

export async function createCalendarUrl(
  snapshot: CalendarSnapshot,
  origin = window.location.origin,
): Promise<string> {
  const content = JSON.stringify(snapshot);
  const compressed = await compressedBytes(content);
  const payload = toBase64Url(compressed ?? new TextEncoder().encode(content));
  const url = new URL("/api/calendar/ics", origin);
  url.search = new URLSearchParams({
    payload,
    encoding: compressed ? "deflate" : "plain",
  }).toString();
  if (url.href.length > MAX_CALENDAR_URL_LENGTH)
    throw new CalendarUrlTooLongError("Calendar URL exceeds 8 KB");
  return url.href;
}

export async function downloadCalendar(
  snapshot: CalendarSnapshot,
): Promise<void> {
  const response = await fetch("/api/calendar/ics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
  });
  if (!response.ok) throw new Error("Calendar download failed");

  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "hon.ics";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
