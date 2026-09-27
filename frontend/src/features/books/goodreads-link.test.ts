import { describe, expect, test } from "vitest";
import type { Book } from "../../types";
import { goodreadsBookUrl } from "./goodreads-link";

const book: Book = {
  id: "manual-1",
  title: "Espelhos de água",
  author: "Samantha Sotto Yambao",
  page_count: 364,
  cover_url: null,
};

describe("goodreadsBookUrl", () => {
  test("uses an ISBN to open the edition directly", () => {
    expect(goodreadsBookUrl({ ...book, isbn: "978-65-5924-063-0" })).toBe(
      "https://www.goodreads.com/book/isbn/9786559240630",
    );
    expect(goodreadsBookUrl({ ...book, id: "isbn:9786559240630" })).toBe(
      "https://www.goodreads.com/book/isbn/9786559240630",
    );
  });

  test("searches by title and author when there is no ISBN", () => {
    expect(goodreadsBookUrl(book)).toBe(
      `https://www.goodreads.com/search?q=${encodeURIComponent("Espelhos de água Samantha Sotto Yambao")}`,
    );
    expect(goodreadsBookUrl({ ...book, author: "Manual entry" })).toBe(
      `https://www.goodreads.com/search?q=${encodeURIComponent("Espelhos de água")}`,
    );
  });
});
