import { describe, expect, test } from "bun:test";
import type { Book } from "../../types";
import {
  type DragState,
  calculateItemGap,
  findTargetIndex,
  getBookReorderStyle,
  reorderBooks,
} from "./book-reorder";

const books: Book[] = [
  {
    id: "a",
    title: "First",
    author: "Author",
    page_count: 100,
    cover_url: null,
  },
  {
    id: "b",
    title: "Second",
    author: "Author",
    page_count: 200,
    cover_url: null,
  },
  {
    id: "c",
    title: "Third",
    author: "Author",
    page_count: 300,
    cover_url: null,
  },
];

const slots = [
  { top: 0, height: 100 },
  { top: 112, height: 100 },
  { top: 224, height: 100 },
];

describe("book reorder", () => {
  test("moves a book without mutating the original list", () => {
    const reordered = reorderBooks(books, 0, 2);

    expect(reordered.map((book) => book.id)).toEqual(["b", "c", "a"]);
    expect(books.map((book) => book.id)).toEqual(["a", "b", "c"]);
  });

  test("returns original list for invalid or unchanged positions", () => {
    expect(reorderBooks(books, -1, 1)).toBe(books);
    expect(reorderBooks(books, 1, 1)).toBe(books);
    expect(reorderBooks(books, 0, books.length)).toBe(books);
  });

  test("calculates slot gap and target index from vertical movement", () => {
    expect(calculateItemGap(slots)).toBe(12);
    expect(findTargetIndex(slots, 0, 50)).toBe(0);
    expect(findTargetIndex(slots, 0, 230)).toBe(2);
    expect(findTargetIndex(slots, 2, -231)).toBe(0);
  });

  test("calculates dragged and displaced item styles", () => {
    const state: DragState = {
      bookId: "a",
      pointerId: 1,
      originIndex: 0,
      targetIndex: 2,
      startY: 50,
      currentY: 190,
      activated: true,
      slots,
      itemGap: 12,
    };

    expect(getBookReorderStyle(state, 0, "a")).toEqual({
      transform: "translateY(140px) scale(1.018) rotate(2deg)",
      zIndex: "3",
      transition: "none",
    });
    expect(getBookReorderStyle(state, 1, "b")).toEqual({
      transform: "translateY(-112px)",
    });
    expect(getBookReorderStyle(state, 2, "c")).toEqual({
      transform: "translateY(-112px)",
    });
  });
});
