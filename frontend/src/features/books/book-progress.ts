import type { Book } from "../../types";

export function parseProgressInput(
  value: string,
  maximum: number,
): number | undefined {
  if (value === "") return undefined;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return undefined;
  return Math.max(0, Math.min(maximum, parsed));
}

export function pagesFromPercent(
  value: string,
  pageCount: number,
): number | undefined {
  const percent = parseProgressInput(value, 100);
  return percent === undefined
    ? undefined
    : Math.round((percent / 100) * pageCount);
}

export function totalBookPages(books: Book[]): number {
  return books.reduce((sum, book) => sum + book.page_count, 0);
}

export function totalRemainingBookPages(books: Book[]): number {
  return books.reduce(
    (sum, book) => sum + Math.max(0, book.page_count - (book.pages_read ?? 0)),
    0,
  );
}
