import { describe, expect, test } from "vitest";
import type { Book, PageBook } from "../../types";
import { loadBooks, saveBooks } from "./book-storage";

const books: PageBook[] = [
  {
    id: "dune",
    title: "Dune",
    author: "Frank Herbert",
    kind: "page",
    format: "unspecified",
    page_count: 412,
    cover_url: null,
    pages_read: 100,
  },
];

describe("book storage", () => {
  test("keeps visual preferences and drops malformed decoration without losing books", () => {
    const book = {
      ...books[0],
      background_hidden: true,
      visuals: { dominant_color: "#123456", artwork: null },
    };
    const adapter = {
      getItem: () => JSON.stringify([book]),
      setItem: () => {},
    };
    expect(loadBooks(adapter)).toEqual([book]);
    adapter.getItem = () =>
      JSON.stringify([{ ...book, visuals: { dominant_color: "bad" } }]);
    const [restored] = loadBooks(adapter);
    expect(restored.title).toBe(book.title);
    expect(restored.background_hidden).toBe(true);
    expect(restored.visuals).toBeUndefined();
  });
  test("round trips book data", () => {
    const storage = new Map<string, string>();
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };

    saveBooks(adapter, books);

    expect(loadBooks(adapter)).toEqual(books);
  });

  test("preserves valid series membership and rejects malformed positions", () => {
    const seriesBook: PageBook = {
      ...books[0],
      kind: "page",
      format: "physical",
      series: { id: "42", name: "Dune", position: 1.5 },
    };
    let serialized = "";
    const adapter = {
      getItem: () => serialized,
      setItem: (_key: string, value: string) => {
        serialized = value;
      },
    };
    saveBooks(adapter, [seriesBook]);
    expect(loadBooks(adapter)).toEqual([seriesBook]);
    serialized = JSON.stringify([
      { ...seriesBook, series: { ...seriesBook.series, position: "first" } },
    ]);
    expect(loadBooks(adapter)).toEqual([]);
  });

  test("keeps ordinary search books with null series beside saved progress", () => {
    const ordinary: PageBook = {
      ...books[0],
      id: "google_books:edition",
      series: null,
    };
    const adapter = {
      getItem: () => JSON.stringify([...books, ordinary]),
      setItem: () => {},
    };
    expect(loadBooks(adapter)).toEqual([...books, ordinary]);
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

  test("migrates a legacy page book without changing its identity or progress", () => {
    const { kind: _kind, format: _format, ...legacy } = books[0] as PageBook;
    const adapter = {
      getItem: () => JSON.stringify([legacy]),
      setItem: () => {},
    };
    expect(loadBooks(adapter)).toEqual(books);
  });

  test("round trips audiobook duration and listening progress", () => {
    const audio: Book = {
      id: "audiosilo:w1:r1",
      title: "Dune",
      author: "Frank Herbert",
      kind: "audiobook",
      duration_minutes: 300,
      minutes_listened: 75,
      narrators: ["Reader"],
      cover_url: null,
    };
    let serialized = "";
    const adapter = {
      getItem: () => serialized,
      setItem: (_key: string, value: string) => {
        serialized = value;
      },
    };
    saveBooks(adapter, [audio]);
    expect(loadBooks(adapter)).toEqual([audio]);
  });
});
