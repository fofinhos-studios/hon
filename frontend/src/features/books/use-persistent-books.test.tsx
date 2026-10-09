import "../../test/setup";

import { cleanup, fireEvent, render } from "@testing-library/preact";
import { afterEach, describe, expect, test } from "vitest";
import type { PageBook } from "../../types";
import { usePersistentBooks } from "./use-persistent-books";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const book: PageBook = {
  id: "dune",
  title: "Dune",
  author: "Frank Herbert",
  kind: "page",
  format: "unspecified",
  page_count: 412,
  cover_url: null,
};

function Harness() {
  const { books, addBook, addBooks, removeBook, reorderBooks, updateProgress } =
    usePersistentBooks();
  return (
    <>
      <button type="button" onClick={() => addBook(book)}>
        Add
      </button>
      <button
        type="button"
        onClick={() =>
          addBooks([
            book,
            { ...book, id: "messiah", title: "Dune Messiah", page_count: 256 },
            {
              ...book,
              id: "children",
              title: "Children of Dune",
              page_count: 400,
            },
            { ...book, id: "messiah", title: "Dune Messiah", page_count: 256 },
          ])
        }
      >
        Add series
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
      <span>
        {books[0]?.kind === "page"
          ? (books[0].pages_read ?? books.length)
          : books.length}
      </span>
      <output data-testid="books">
        {books
          .map(
            (entry) =>
              `${entry.id}:${entry.kind === "page" ? (entry.pages_read ?? 0) : 0}`,
          )
          .join(",")}
      </output>
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

  test("bulk add preserves existing progress and appends each unseen ID once", () => {
    const view = render(<Harness />);
    fireEvent.click(view.getByText("Add"));
    fireEvent.click(view.getByText("Progress"));
    fireEvent.click(view.getByText("Add series"));
    fireEvent.click(view.getByText("Add series"));
    expect(view.getByTestId("books").textContent).toBe(
      "dune:100,messiah:0,children:0",
    );
    view.unmount();

    const restored = render(<Harness />);
    expect(restored.getByTestId("books").textContent).toBe(
      "dune:100,messiah:0,children:0",
    );
  });
});
