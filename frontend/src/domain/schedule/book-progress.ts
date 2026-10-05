import type { Book } from "../../types";

export function remainingPages(book: Book): number {
  return book.kind === "page"
    ? Math.max(0, book.page_count - (book.pages_read ?? 0))
    : 0;
}

export function totalRemainingPages(books: Book[]): number {
  return books.reduce((sum, book) => sum + remainingPages(book), 0);
}

export function remainingMinutes(book: Book): number {
  return book.kind === "audiobook"
    ? Math.max(0, book.duration_minutes - (book.minutes_listened ?? 0))
    : 0;
}

export function totalRemainingMinutes(books: Book[]): number {
  return books.reduce((sum, book) => sum + remainingMinutes(book), 0);
}

export function remainingUnits(book: Book): number {
  return book.kind === "page" ? remainingPages(book) : remainingMinutes(book);
}
