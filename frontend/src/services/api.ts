import type { Book, BookVisuals, SearchBook } from "../types";

const API_BASE = "/api";

export async function fetchBookVisuals(
  book: Book,
  signal: AbortSignal,
): Promise<BookVisuals> {
  const response = await fetch(`${API_BASE}/books/visuals`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: book.id,
      title: book.title,
      author: book.author,
      cover_url: book.cover_url,
    }),
  });
  if (!response.ok) throw new Error("Book visuals unavailable");
  return response.json() as Promise<BookVisuals>;
}

async function parseError(
  response: Response,
  fallback: string,
): Promise<Error> {
  try {
    const data = (await response.json()) as { detail?: string };
    if (typeof data.detail === "string") return new Error(data.detail);
  } catch {
    // ignore
  }
  return new Error(fallback);
}

export interface SearchResult {
  books: SearchBook[];
  source: "google_books" | "open_library" | "bookinfo" | "combined";
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
