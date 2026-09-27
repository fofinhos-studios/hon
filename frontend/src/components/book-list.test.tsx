import "../test/setup";

import { cleanup, fireEvent, render } from "@testing-library/preact";
import { afterEach, describe, expect, test, vi } from "vitest";
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
  test("leaves reordering in the schedule and places the number before the title", () => {
    const view = render(
      <BookList
        books={books}
        onRemove={() => {}}
        onUpdateProgress={() => {}}
        onUpdatePageCount={() => {}}
      />,
    );
    expect(view.queryByRole("button", { name: /Move / })).toBeNull();
    expect(view.container.querySelector(".reorder-handle")).toBeNull();
    expect(view.queryByText("To read")).toBeNull();
    expect(view.getByRole("heading", { name: /First Book/ }).textContent).toBe(
      "Position 1First Book",
    );
  });
  test("renders empty state without duplicate library totals", () => {
    const empty = render(
      <BookList
        books={[]}
        onRemove={() => {}}
        onUpdatePageCount={() => {}}
        onUpdateProgress={() => {}}
      />,
    );
    expect(empty.getByText("Your library is empty.")).toBeTruthy();
    empty.unmount();

    const populated = render(
      <BookList
        books={books}
        onRemove={() => {}}
        onUpdatePageCount={() => {}}
        onUpdateProgress={() => {}}
      />,
    );
    expect(populated.queryByText(/pages left/)).toBeNull();
  });

  test("forwards progress and removal", () => {
    const onRemove = vi.fn(() => {});
    const onUpdateProgress = vi.fn(() => {});
    const view = render(
      <BookList
        books={books}
        onRemove={onRemove}
        onUpdatePageCount={() => {}}
        onUpdateProgress={onUpdateProgress}
      />,
    );

    fireEvent.input(view.getByLabelText("Pages read for First Book"), {
      target: { value: "25" },
    });
    fireEvent.click(view.getByLabelText("Remove First Book"));
    const item = view.getByText("First Book").closest("li");
    if (!item) throw new Error("Expected book list item");
    fireEvent.pointerDown(item, { pointerId: 1, clientY: 0 });

    expect(onUpdateProgress).toHaveBeenCalledWith("a", 25);
    expect(onRemove).toHaveBeenCalledWith("a");
  });
});
