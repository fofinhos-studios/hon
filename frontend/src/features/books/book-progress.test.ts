import { describe, expect, test } from "bun:test";
import type { Book } from "../../types";
import {
  pagesFromPercent,
  parseProgressInput,
  totalBookPages,
  totalRemainingBookPages,
} from "./book-progress";

const books: Book[] = [
  {
    id: "a",
    title: "A",
    author: "Author",
    page_count: 100,
    cover_url: null,
    pages_read: 25,
  },
  {
    id: "b",
    title: "B",
    author: "Author",
    page_count: 200,
    cover_url: null,
  },
];

describe("book progress", () => {
  test("parses and clamps input", () => {
    expect(parseProgressInput("", 100)).toBeUndefined();
    expect(parseProgressInput("150", 100)).toBe(100);
    expect(parseProgressInput("-10", 100)).toBe(0);
  });

  test("converts percentage to pages", () => {
    expect(pagesFromPercent("50", 101)).toBe(51);
    expect(pagesFromPercent("", 101)).toBeUndefined();
  });

  test("calculates totals", () => {
    expect(totalBookPages(books)).toBe(300);
    expect(totalRemainingBookPages(books)).toBe(275);
  });
});
