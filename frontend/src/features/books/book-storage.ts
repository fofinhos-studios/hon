import type { Book, BookVisuals } from "../../types";

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

function validVisuals(value: unknown): value is BookVisuals {
  if (!value || typeof value !== "object") return false;
  const visuals = value as Partial<BookVisuals>;
  const art = visuals.artwork;
  return (
    (visuals.dominant_color === null ||
      (typeof visuals.dominant_color === "string" &&
        /^#[0-9a-f]{6}$/i.test(visuals.dominant_color))) &&
    (art === null ||
      (!!art &&
        typeof art === "object" &&
        typeof art.image_url === "string" &&
        typeof art.source_url === "string" &&
        typeof art.author === "string" &&
        typeof art.license === "string"))
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
    return books.every(isBook)
      ? books.map((book) => {
          const { visuals, visuals_checked_at, background_hidden, ...rest } =
            book;
          return {
            ...rest,
            ...(validVisuals(visuals) ? { visuals } : {}),
            ...(typeof visuals_checked_at === "number" &&
            Number.isFinite(visuals_checked_at)
              ? { visuals_checked_at }
              : {}),
            ...(typeof background_hidden === "boolean"
              ? { background_hidden }
              : {}),
          };
        })
      : [];
  } catch {
    return [];
  }
}

export function saveBooks(storage: StorageAdapter, books: Book[]): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(books));
  } catch {
    /* A full or disabled store must not break the current reading session. */
  }
}
