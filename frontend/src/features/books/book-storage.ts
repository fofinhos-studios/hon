import type { Book, BookVisuals, PageBook, SearchBook } from "../../types";

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

function validSearchBook(value: unknown): value is SearchBook {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const edition = value as Record<string, unknown>;
  if (
    "available_editions" in edition ||
    typeof edition.id !== "string" ||
    !edition.id ||
    typeof edition.source !== "string" ||
    !edition.source ||
    typeof edition.work_key !== "string" ||
    !edition.work_key ||
    typeof edition.title !== "string" ||
    typeof edition.author !== "string" ||
    (edition.cover_url !== null && typeof edition.cover_url !== "string") ||
    ![
      "cover_fallback_url",
      "isbn",
      "language",
      "publisher",
      "published_date",
    ].every(
      (key) =>
        edition[key] === undefined ||
        edition[key] === null ||
        typeof edition[key] === "string",
    ) ||
    "visuals" in edition ||
    "visuals_checked_at" in edition ||
    "pages_read" in edition ||
    "minutes_listened" in edition
  )
    return false;
  if (edition.kind === "audiobook")
    return (
      (edition.duration_minutes === null ||
        (typeof edition.duration_minutes === "number" &&
          Number.isSafeInteger(edition.duration_minutes) &&
          edition.duration_minutes > 0)) &&
      Array.isArray(edition.narrators) &&
      edition.narrators.every((name) => typeof name === "string")
    );
  if (edition.kind !== "page") return false;
  const series = edition.series;
  return (
    (edition.page_count === null ||
      (typeof edition.page_count === "number" &&
        Number.isSafeInteger(edition.page_count) &&
        edition.page_count > 0)) &&
    typeof edition.format === "string" &&
    ["physical", "digital", "unspecified"].includes(edition.format) &&
    (series == null ||
      (typeof series === "object" &&
        !Array.isArray(series) &&
        "id" in series &&
        typeof series.id === "string" &&
        "name" in series &&
        typeof series.name === "string" &&
        "position" in series &&
        (series.position === null ||
          (typeof series.position === "number" &&
            Number.isFinite(series.position)))))
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
          const {
            visuals,
            visuals_checked_at,
            background_hidden,
            available_editions,
            ...rest
          } = book;
          return {
            ...rest,
            ...(Array.isArray(available_editions) &&
            available_editions.every(validSearchBook)
              ? { available_editions }
              : {}),
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
