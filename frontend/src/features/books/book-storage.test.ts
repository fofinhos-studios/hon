import { describe, expect, test } from "vitest";
import type { Book } from "../../types";
import { loadBooks, saveBooks } from "./book-storage";

const books: Book[] = [
  {
    id: "dune",
    title: "Dune",
    author: "Frank Herbert",
    page_count: 412,
    cover_url: null,
    pages_read: 100,
  },
];

describe("book storage", () => {
  test("round trips book data", () => {
    const storage = new Map<string, string>();
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };

    saveBooks(adapter, books);

    expect(loadBooks(adapter)).toEqual(books);
  });

  test("returns empty list for malformed or invalid data", () => {
    const adapter = {
      getItem: () => '{"books":[]}',
      setItem: () => {},
    };
    expect(loadBooks(adapter)).toEqual([]);

    adapter.getItem = () => "not-json";
    expect(loadBooks(adapter)).toEqual([]);
  });

  test("reads legacy versioned book data", () => {
    const adapter = {
      getItem: () => JSON.stringify({ version: 1, books }),
      setItem: () => {},
    };

    expect(loadBooks(adapter)).toEqual(books);
  });
});
