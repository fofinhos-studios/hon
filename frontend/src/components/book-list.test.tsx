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
  test("offers keyboard-operable ordering without changing book identity", () => {
    const onReorder = vi.fn();
    const view = render(
      <BookList
        books={books}
        onRemove={() => {}}
        onReorder={onReorder}
        onUpdateProgress={() => {}}
      />,
    );
    fireEvent.click(view.getByRole("button", { name: "Move First Book down" }));
    expect(onReorder).toHaveBeenCalledWith([books[1], books[0]]);
    expect(
      view
        .getByRole("button", {
          name: "Move First Book up",
        })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
  test("renders empty state and summary", () => {
    const empty = render(
      <BookList
        books={[]}
        onRemove={() => {}}
        onReorder={() => {}}
        onUpdateProgress={() => {}}
      />,
    );
    expect(empty.getByText("Your library is empty.")).toBeTruthy();
    empty.unmount();

    const populated = render(
      <BookList
        books={books}
        onRemove={() => {}}
        onReorder={() => {}}
        onUpdateProgress={() => {}}
      />,
    );
    expect(populated.getByText("2 books · 300 / 300 pages left")).toBeTruthy();
  });

  test("forwards progress, removal, and drag interactions", () => {
    const onRemove = vi.fn(() => {});
    const onUpdateProgress = vi.fn(() => {});
    const view = render(
      <BookList
        books={books}
        onRemove={onRemove}
        onReorder={() => {}}
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
