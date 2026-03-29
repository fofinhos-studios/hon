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

export async function searchBooks(query: string): Promise<Book[]> {
  const params = new URLSearchParams({ q: query });
  const response = await fetch(`${API_BASE}/books/search?${params}`);
  if (!response.ok) throw await parseError(response, "Search failed");
  return response.json() as Promise<Book[]>;
}
