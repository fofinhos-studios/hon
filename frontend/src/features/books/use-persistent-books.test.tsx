import "../../test/setup";

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import type { Book } from "../../types";
import { usePersistentBooks } from "./use-persistent-books";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const book: Book = {
  id: "dune",
  title: "Dune",
  author: "Frank Herbert",
  page_count: 412,
  cover_url: null,
};

function Harness() {
  const { books, addBook, removeBook, reorderBooks, updateProgress } =
    usePersistentBooks();
  return (
    <>
      <button type="button" onClick={() => addBook(book)}>
        Add
      </button>
      <button type="button" onClick={() => updateProgress(book.id, 100)}>
        Progress
      </button>
      <button type="button" onClick={() => removeBook(book.id)}>
        Remove
      </button>
      <button type="button" onClick={() => reorderBooks([...books].reverse())}>
        Reorder
      </button>
      <span>{books[0]?.pages_read ?? books.length}</span>
    </>
  );
}

describe("usePersistentBooks", () => {
  test("persists book changes", () => {
    const view = render(<Harness />);

    fireEvent.click(view.getByText("Add"));
    fireEvent.click(view.getByText("Progress"));
    view.unmount();

    const next = render(<Harness />);
    expect(next.getByText("100")).toBeTruthy();
  });

  test("does not duplicate books and can remove them", () => {
    const view = render(<Harness />);

    fireEvent.click(view.getByText("Add"));
    fireEvent.click(view.getByText("Add"));
    expect(view.getByText("1")).toBeTruthy();
    fireEvent.click(view.getByText("Reorder"));
    fireEvent.click(view.getByText("Remove"));

    expect(view.getByText("0")).toBeTruthy();
  });
});
