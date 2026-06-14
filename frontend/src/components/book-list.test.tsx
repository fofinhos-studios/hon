import "../test/setup";

import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import type { Book } from "../types";
import { BookList } from "./book-list";

afterEach(cleanup);

const books: Book[] = [
  {
    id: "a",
    title: "First Book",
    author: "Author A",
    page_count: 100,
    cover_url: null,
  },
  {
    id: "b",
    title: "Second Book",
    author: "Author B",
    page_count: 200,
    cover_url: null,
  },
];

describe("BookList", () => {
  test("reorders books when a card is dragged onto another card", async () => {
    const onRemove = mock(() => {});
    const onReorder = mock((_books: Book[]) => {});
    const onUpdateProgress = mock(
      (_id: string, _pagesRead: number | undefined) => {},
    );
    const view = render(
      <BookList
        books={books}
        onRemove={onRemove}
        onReorder={onReorder}
        onUpdateProgress={onUpdateProgress}
      />,
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
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerId: 1,
        clientY: 190,
      }),
    );
    window.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 1,
        clientY: 190,
      }),
    );

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0]?.[0].map((book) => book.id)).toEqual([
      "b",
      "a",
    ]);
  });

  test("allows changing pages read and percentage read", () => {
    const onRemove = mock(() => {});
    const onReorder = mock(() => {});
    const onUpdateProgress = mock(
      (_id: string, _pagesRead: number | undefined) => {},
    );

    const view = render(
      <BookList
        books={books}
        onRemove={onRemove}
        onReorder={onReorder}
        onUpdateProgress={onUpdateProgress}
      />,
    );

    const pagesInput = view.getByLabelText(
      "Pages read for First Book",
    ) as HTMLInputElement;
    const percentInput = view.getByLabelText(
      "Percentage read for First Book",
    ) as HTMLInputElement;

    // Initially they should be empty
    expect(pagesInput.value).toBe("");
    expect(percentInput.value).toBe("");

    // Simulate entering pages read
    fireEvent.input(pagesInput, { target: { value: "30" } });
    expect(onUpdateProgress).toHaveBeenCalledWith("a", 30);

    // Simulate entering percent read
    fireEvent.input(percentInput, { target: { value: "50" } });
    expect(onUpdateProgress).toHaveBeenCalledWith("a", 50); // 50% of 100 is 50 pages
  });
});
