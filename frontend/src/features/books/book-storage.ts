import type { Book, BookVisuals, PageBook } from "../../types";

const STORAGE_KEY = "hon.books";

interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): unknown;
}

function isBook(value: unknown): value is Book {
  if (!value || typeof value !== "object") return false;
  const book = value as Record<string, unknown>;
  const common =
    typeof book.id === "string" &&
    typeof book.title === "string" &&
    typeof book.author === "string" &&
    (book.cover_url === null || typeof book.cover_url === "string") &&
    (book.kind === "page" || book.kind === "audiobook");
  if (!common) return false;
  if (book.kind === "audiobook") {
    const duration = book.duration_minutes;
    const listened = book.minutes_listened;
    return (
      typeof duration === "number" &&
      Number.isSafeInteger(duration) &&
      duration > 0 &&
      Array.isArray(book.narrators) &&
      book.narrators.every((name) => typeof name === "string") &&
      (listened === undefined ||
        (typeof listened === "number" &&
          Number.isSafeInteger(listened) &&
          listened >= 0 &&
          listened <= duration))
    );
  }
  const pages = book.page_count;
  const read = book.pages_read;
  const series = book.series;
  return (
    typeof pages === "number" &&
    Number.isSafeInteger(pages) &&
    pages > 0 &&
    typeof book.format === "string" &&
    ["physical", "digital", "unspecified"].includes(book.format) &&
    (series == null ||
      (typeof series === "object" &&
        "id" in series &&
        typeof series.id === "string" &&
        "name" in series &&
        typeof series.name === "string" &&
        "position" in series &&
        (series.position === null ||
          (typeof series.position === "number" &&
            Number.isFinite(series.position))))) &&
    (read === undefined ||
      (typeof read === "number" &&
        Number.isSafeInteger(read) &&
        read >= 0 &&
        read <= pages))
  );
}

function migrateLegacyBook(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const book = value as Partial<PageBook>;
  if (book.kind !== undefined) return value;
  return { ...book, kind: "page", format: "unspecified" };
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
    const migrated = books.map(migrateLegacyBook);
    return migrated.every(isBook)
      ? migrated.map((book) => {
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
