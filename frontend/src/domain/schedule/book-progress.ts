import type { Book } from "../../types";

export function remainingPages(book: Book): number {
  return Math.max(0, book.page_count - (book.pages_read ?? 0));
}

export function totalRemainingPages(books: Book[]): number {
  return books.reduce((sum, book) => sum + remainingPages(book), 0);
}
