import "../test/setup";

import { cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Book } from "../types";
import { useBookReorder } from "./use-book-reorder";

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

function ReorderHarness({
  onReorder,
}: {
  onReorder: (reorderedBooks: Book[]) => void;
}) {
  const { handlePointerDown, setItemRef } = useBookReorder(books, onReorder);
  return (
    <ul>
      {books.map((book) => (
        <li
          key={book.id}
          ref={(element) => setItemRef(book.id, element)}
          onPointerDown={(event) => handlePointerDown(book.id, event)}
        >
          {book.title}
        </li>
      ))}
    </ul>
  );
}

function setBookRects(view: ReturnType<typeof render>) {
  const first = view.getByText("First Book");
  const second = view.getByText("Second Book");
  Object.defineProperty(first, "getBoundingClientRect", {
    value: () => ({ top: 0, height: 100 }),
    configurable: true,
  });
  Object.defineProperty(second, "getBoundingClientRect", {
    value: () => ({ top: 112, height: 100 }),
    configurable: true,
  });
  return { first, second };
}

describe("useBookReorder", () => {
  test("reorders books after dragging across another slot", async () => {
    const onReorder = vi.fn((_books: Book[]) => {});
    const view = render(<ReorderHarness onReorder={onReorder} />);
    const { first } = setBookRects(view);

    first.dispatchEvent(
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

    expect(onReorder.mock.calls[0]?.[0].map((book) => book.id)).toEqual([
      "b",
      "a",
    ]);
  });

  test("removes pointer listeners when unmounted during drag", () => {
    const removedTypes: string[] = [];
    const originalRemoveEventListener = window.removeEventListener.bind(window);
    window.removeEventListener = ((type: string, listener: EventListener) => {
      removedTypes.push(type);
      originalRemoveEventListener(type, listener);
    }) as typeof window.removeEventListener;
    const view = render(<ReorderHarness onReorder={() => {}} />);
    const { first } = setBookRects(view);

    first.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        button: 0,
      }),
    );
    view.unmount();
    window.removeEventListener = originalRemoveEventListener;

    expect(removedTypes).toEqual(
      expect.arrayContaining(["pointermove", "pointerup", "pointercancel"]),
    );
  });
});
