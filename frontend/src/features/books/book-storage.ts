import type { Book } from "../../types";

const STORAGE_KEY = "hon.books";
const STORAGE_VERSION = 1;

interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): unknown;
}

interface StoredBooks {
  version: number;
  books: Book[];
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
    const value = JSON.parse(raw) as Partial<StoredBooks>;
    if (
      value.version !== STORAGE_VERSION ||
      !Array.isArray(value.books) ||
      !value.books.every(isBook)
    ) {
      return [];
    }
    return value.books;
  } catch {
    return [];
  }
}

export function saveBooks(storage: StorageAdapter, books: Book[]): void {
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: STORAGE_VERSION, books } satisfies StoredBooks),
  );
}
