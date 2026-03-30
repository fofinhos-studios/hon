import "../test/setup";

import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render } from "@testing-library/preact";
import type { Book } from "../types";
import { BookList } from "./book-list";

const books: Book[] = [
  { id: "a", title: "First Book", author: "Author A", page_count: 100, cover_url: null },
  { id: "b", title: "Second Book", author: "Author B", page_count: 200, cover_url: null },
];

describe("BookList", () => {
  test("reorders books when a card is dragged onto another card", async () => {
    const onRemove = mock(() => {});
    const onReorder = mock((_books: Book[]) => {});
    const view = render(
      <BookList books={books} onRemove={onRemove} onReorder={onReorder} />,
    );

    const firstCard = view.getByText("First Book").closest("li");
    const secondCard = view.getByText("Second Book").closest("li");

    if (!firstCard || !secondCard) {
      throw new Error("Expected both draggable cards to render");
    }

    Object.defineProperty(firstCard, "getBoundingClientRect", {
      value: () => ({
        top: 0,
        height: 100,
        bottom: 100,
        left: 0,
        right: 320,
        width: 320,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
      configurable: true,
    });
    Object.defineProperty(secondCard, "getBoundingClientRect", {
      value: () => ({
        top: 112,
        height: 100,
        bottom: 212,
        left: 0,
        right: 320,
        width: 320,
        x: 0,
        y: 112,
        toJSON: () => ({}),
      }),
      configurable: true,
    });

    firstCard.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        button: 0,
        clientY: 50,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    window.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientY: 190 }),
    );
    window.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientY: 190 }),
    );

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0]?.[0].map((book) => book.id)).toEqual(["b", "a"]);
  });
});
