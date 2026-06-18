import type { Book, DayOfWeek } from "../../types";

export const EVERY_DAY: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAYS: DayOfWeek[] = [0, 1, 2, 3, 4];
export const WEEKENDS: DayOfWeek[] = [5, 6];

export function makeBook(id: string, pages: number, pagesRead?: number): Book {
  return {
    id,
    title: id,
    author: "Test",
    page_count: pages,
    cover_url: null,
    pages_read: pagesRead,
  };
}
