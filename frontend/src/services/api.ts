import type { Book } from "../types";

const API_BASE = "/api";

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
  books: Book[];
  source: "google_books" | "open_library";
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
