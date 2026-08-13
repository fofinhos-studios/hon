import "../../test/setup";

import { cleanup, fireEvent, render } from "@testing-library/preact";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Book } from "../../types";
import { BookCard } from "./book-card";

afterEach(cleanup);

const book: Book = {
  id: "a",
  title: "First Book",
  author: "Author",
  page_count: 100,
  cover_url: null,
};

describe("BookCard", () => {
  test("updates pages and percentage progress", () => {
    const onUpdateProgress = vi.fn((_pages: number | undefined) => {});
    const view = render(
      <BookCard
        book={book}
        isDragging={false}
        isDropTarget={false}
        onPointerDown={() => {}}
        onRemove={() => {}}
        onUpdateProgress={onUpdateProgress}
        itemRef={() => {}}
      />,
    );

    fireEvent.input(view.getByLabelText("Pages read for First Book"), {
      target: { value: "30" },
    });
    fireEvent.input(view.getByLabelText("Percentage read for First Book"), {
      target: { value: "50" },
    });

    expect(onUpdateProgress).toHaveBeenCalledWith(30);
    expect(onUpdateProgress).toHaveBeenCalledWith(50);
  });

  test("removes book", () => {
    const onRemove = vi.fn(() => {});
    const view = render(
      <BookCard
        book={book}
        isDragging={false}
        isDropTarget={false}
        onPointerDown={() => {}}
        onRemove={onRemove}
        onUpdateProgress={() => {}}
        itemRef={() => {}}
      />,
    );

    fireEvent.click(view.getByLabelText("Remove First Book"));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
