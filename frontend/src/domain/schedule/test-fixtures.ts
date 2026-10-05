import type { Audiobook, DayOfWeek, PageBook } from "../../types";

export const EVERY_DAY: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAYS: DayOfWeek[] = [0, 1, 2, 3, 4];
export const WEEKENDS: DayOfWeek[] = [5, 6];

export function makeBook(
  id: string,
  pages: number,
  pagesRead?: number,
): PageBook {
  return {
    kind: "page",
    format: "unspecified",
    id,
    title: id,
    author: "Test",
    page_count: pages,
    cover_url: null,
    pages_read: pagesRead,
  };
}

export function makeAudiobook(
  id: string,
  minutes: number,
  minutesListened?: number,
): Audiobook {
  return {
    kind: "audiobook",
    id,
    title: id,
    author: "Test",
    duration_minutes: minutes,
    minutes_listened: minutesListened,
    narrators: [],
    cover_url: null,
  };
}
