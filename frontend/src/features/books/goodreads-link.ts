import type { Book } from "../../types";

export function goodreadsBookUrl(book: Book): string {
  const isbn = (
    book.isbn || (book.id.startsWith("isbn:") ? book.id.slice(5) : "")
  )
    .replace(/[\s-]/g, "")
    .toUpperCase();
  if (/^(?:\d{13}|\d{9}[\dX])$/.test(isbn)) {
    return `https://www.goodreads.com/book/isbn/${isbn}`;
  }

  const author = book.author.trim();
  const query =
    author && author !== "Manual entry" && author !== "Unknown"
      ? `${book.title} ${author}`
      : book.title;
  return `https://www.goodreads.com/search?q=${encodeURIComponent(query.trim())}`;
}
