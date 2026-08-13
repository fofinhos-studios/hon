import type { Book } from "../../types";

const STORAGE_KEY = "hon.books";

interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): unknown;
}

function isBook(value: unknown): value is Book {
  if (!value || typeof value !== "object") return false;
  const book = value as Partial<Book>;
  return (
    typeof book.id === "string" &&
    typeof book.title === "string" &&
    typeof book.author === "string" &&
    typeof book.page_count === "number" &&
    (book.cover_url === null || typeof book.cover_url === "string") &&
    (book.pages_read === undefined || typeof book.pages_read === "number")
  );
}

export function loadBooks(storage: StorageAdapter): Book[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const value = JSON.parse(raw) as unknown;
    const books = Array.isArray(value)
      ? value
      : value &&
          typeof value === "object" &&
          "books" in value &&
          Array.isArray(value.books)
        ? value.books
        : [];
    return books.every(isBook) ? books : [];
  } catch {
    return [];
  }
}

export function saveBooks(storage: StorageAdapter, books: Book[]): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(books));
}
