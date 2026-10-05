import type { Book, BookVisuals, SearchBook } from "../types";

const API_BASE = "/api";

export class SearchApiError extends Error {
  readonly code: "invalid" | "timeout" | "unavailable" | "unknown";

  constructor(message: string, status: number) {
    super(message);
    this.code =
      status === 422
        ? "invalid"
        : status === 504
          ? "timeout"
          : status === 502
            ? "unavailable"
            : "unknown";
  }
}

const VISUALS_CACHE_KEY = "hon.book-visuals.v2";
const VISUALS_CACHE_LIMIT = 200;
const VISUALS_CACHE_SUCCESS_TTL = 24 * 60 * 60 * 1000;
const VISUALS_CACHE_EMPTY_TTL = 60 * 60 * 1000;

interface CachedVisuals {
  checkedAt: number;
  visuals: BookVisuals;
}

const visualsCache = new Map<string, CachedVisuals>();
const visualsInFlight = new Map<string, Promise<BookVisuals>>();

type VisualsBook = Pick<
  Book,
  "id" | "title" | "author" | "cover_url" | "cover_fallback_url"
>;

function visualsKey(
  book: Pick<VisualsBook, "id" | "cover_url" | "cover_fallback_url">,
): string {
  return JSON.stringify([
    book.id,
    book.cover_url ?? "",
    book.cover_fallback_url ?? "",
  ]);
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
        typeof art.image_url === "string" &&
        typeof art.source_url === "string" &&
        typeof art.author === "string" &&
        typeof art.license === "string"))
  );
}

function cacheTtl(visuals: BookVisuals): number {
  return visuals.artwork || visuals.dominant_color
    ? VISUALS_CACHE_SUCCESS_TTL
    : VISUALS_CACHE_EMPTY_TTL;
}

function readVisualsCache(key: string): CachedVisuals | undefined {
  const memory = visualsCache.get(key);
  if (memory && Date.now() - memory.checkedAt < cacheTtl(memory.visuals))
    return memory;
  if (memory) visualsCache.delete(key);

  try {
    const saved = localStorage.getItem(VISUALS_CACHE_KEY);
    if (!saved) return undefined;
    const entries = JSON.parse(saved) as Record<string, unknown>;
    const entry = entries[key] as Partial<CachedVisuals> | undefined;
    if (
      !entry ||
      typeof entry.checkedAt !== "number" ||
      !Number.isFinite(entry.checkedAt) ||
      !validVisuals(entry.visuals) ||
      Date.now() - entry.checkedAt >= cacheTtl(entry.visuals)
    )
      return undefined;
    const cached = { checkedAt: entry.checkedAt, visuals: entry.visuals };
    visualsCache.set(key, cached);
    return cached;
  } catch {
    return undefined;
  }
}

function writeVisualsCache(key: string, visuals: BookVisuals): void {
  const entry = { checkedAt: Date.now(), visuals };
  visualsCache.set(key, entry);
  while (visualsCache.size > VISUALS_CACHE_LIMIT) {
    const oldestKey = visualsCache.keys().next().value;
    if (oldestKey === undefined) break;
    visualsCache.delete(oldestKey);
  }
  try {
    const saved = localStorage.getItem(VISUALS_CACHE_KEY);
    const entries: Record<string, unknown> = saved
      ? (JSON.parse(saved) as Record<string, unknown>)
      : {};
    entries[key] = entry;
    for (const [cachedKey, value] of Object.entries(entries)) {
      const cached = value as Partial<CachedVisuals>;
      if (
        typeof cached.checkedAt !== "number" ||
        !validVisuals(cached.visuals) ||
        Date.now() - cached.checkedAt >= cacheTtl(cached.visuals)
      )
        delete entries[cachedKey];
    }
    const keys = Object.keys(entries);
    for (const oldKey of keys.slice(
      0,
      Math.max(0, keys.length - VISUALS_CACHE_LIMIT),
    ))
      delete entries[oldKey];
    localStorage.setItem(VISUALS_CACHE_KEY, JSON.stringify(entries));
  } catch {
    /* Storage is an optional cache; visual lookup still works in memory. */
  }
}

function requestBookVisuals(book: VisualsBook): Promise<BookVisuals> {
  return fetch(`${API_BASE}/books/visuals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: book.id,
      title: book.title,
      author: book.author,
      cover_url: book.cover_url,
      cover_fallback_url: book.cover_fallback_url,
    }),
  }).then((response) => {
    if (!response.ok) throw new Error("Book visuals unavailable");
    return response.json() as Promise<BookVisuals>;
  });
}

export function getBookVisuals(book: VisualsBook): Promise<BookVisuals> {
  const key = visualsKey(book);
  const cached = readVisualsCache(key);
  if (cached) return Promise.resolve(cached.visuals);
  const pending = visualsInFlight.get(key);
  if (pending) return pending;

  const request = requestBookVisuals(book)
    .then((visuals) => {
      if (validVisuals(visuals)) writeVisualsCache(key, visuals);
      return visuals;
    })
    .finally(() => visualsInFlight.delete(key));
  visualsInFlight.set(key, request);
  return request;
}

export function prefetchBookVisuals(book: VisualsBook): void {
  void getBookVisuals(book).catch(() => {
    /* Visual enrichment is optional and must not interrupt search. */
  });
}

export async function fetchBookVisuals(
  book: Book,
  _signal: AbortSignal,
): Promise<BookVisuals> {
  return getBookVisuals(book);
}

async function parseError(
  response: Response,
  fallback: string,
): Promise<Error> {
  try {
    const data = (await response.json()) as { detail?: string };
    if (typeof data.detail === "string")
      return new SearchApiError(data.detail, response.status);
  } catch {
    // ignore
  }
  return new SearchApiError(fallback, response.status);
}

export interface SearchResult {
  books: SearchBook[];
  source:
    | "google_books"
    | "open_library"
    | "bookinfo"
    | "audiosilo"
    | "combined";
  partial?: boolean;
}

export async function searchBooks(
  query: string,
  options: { signal?: AbortSignal } = {},
): Promise<SearchResult> {
  const params = new URLSearchParams({ q: query });
  const response = await fetch(`${API_BASE}/books/search?${params}`, {
    signal: options.signal,
  });
  if (!response.ok) throw await parseError(response, "Search failed");
  return response.json() as Promise<SearchResult>;
}
