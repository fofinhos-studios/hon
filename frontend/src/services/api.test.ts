import "../test/setup";

import { afterEach, describe, expect, mock, test } from "bun:test";
import { searchBooks } from "./api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(response: Partial<Response>) {
  const fetchMock = mock(async () => response as Response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("searchBooks", () => {
  test("requests the search endpoint and returns its result", async () => {
    const fetchMock = mockFetch({
      ok: true,
      json: async () => ({ books: [], source: "google_books" }),
    });
    const controller = new AbortController();

    expect(await searchBooks("Dune & Messiah", { signal: controller.signal })).toEqual({
      books: [],
      source: "google_books",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books/search?q=Dune+%26+Messiah",
      { signal: controller.signal },
    );
  });

  test("uses the API error detail when present", async () => {
    mockFetch({ ok: false, json: async () => ({ detail: "Search is busy" }) });

    try {
      await searchBooks("dune");
      throw new Error("Expected search to fail");
    } catch (error) {
      expect(error).toHaveProperty("message", "Search is busy");
    }
  });

  test("uses a fallback message when an error response is not JSON", async () => {
    mockFetch({
      ok: false,
      json: async () => {
        throw new Error("not JSON");
      },
    });

    try {
      await searchBooks("dune");
      throw new Error("Expected search to fail");
    } catch (error) {
      expect(error).toHaveProperty("message", "Search failed");
    }
  });
});
