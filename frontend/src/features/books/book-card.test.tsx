import "../../test/setup";

import { cleanup, fireEvent, render } from "@testing-library/preact";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { PageBook } from "../../types";
import { BookCard } from "./book-card";

afterEach(cleanup);

const book: PageBook = {
  id: "a",
  title: "First Book",
  author: "Author",
  kind: "page",
  format: "unspecified",
  page_count: 100,
  cover_url: null,
};

describe("BookCard", () => {
  test("edits page count with validation and supports cancelling without saving", () => {
    const update = vi.fn();
    const view = render(
      <BookCard
        book={{ ...book, pages_read: 40 }}
        onRemove={() => {}}
        onUpdateProgress={() => {}}
        onUpdatePageCount={update}
      />,
    );
    const edit = view.getByRole("button", {
      name: "Edit page count for First Book",
    });
    fireEvent.click(edit);
    expect(
      view.queryByRole("button", { name: "Edit page count for First Book" }),
    ).toBeNull();
    const input = view.getByLabelText(
      "Total pages for First Book",
    ) as HTMLInputElement;
    expect(input.value).toBe("100");
    for (const value of ["", "0", "-1", "20", "40.5"]) {
      fireEvent.input(input, { target: { value } });
      expect(
        view.getByRole("button", { name: "Save" }).hasAttribute("disabled"),
      ).toBe(true);
    }
    fireEvent.input(input, { target: { value: "240" } });
    fireEvent.click(view.getByRole("button", { name: "Save" }));
    expect(update).toHaveBeenCalledWith(240);
    const restoredEdit = view.getByRole("button", {
      name: "Edit page count for First Book",
    });
    expect(document.activeElement).toBe(restoredEdit);
    fireEvent.click(restoredEdit);
    fireEvent.input(view.getByLabelText("Total pages for First Book"), {
      target: { value: "300" },
    });
    fireEvent.keyDown(view.getByLabelText("Total pages for First Book"), {
      key: "Escape",
    });
    expect(view.queryByRole("button", { name: "Save" })).toBeNull();
    expect(update).toHaveBeenCalledTimes(1);
    expect(view.queryByRole("button", { name: /background/ })).toBeNull();
  });
  test("updates pages and percentage progress", () => {
    const onUpdateProgress = vi.fn((_pages: number | undefined) => {});
    const view = render(
      <BookCard
        book={book}
        onRemove={() => {}}
        onUpdateProgress={onUpdateProgress}
        onUpdatePageCount={() => {}}
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
        onRemove={onRemove}
        onUpdateProgress={() => {}}
        onUpdatePageCount={() => {}}
      />,
    );

    fireEvent.click(view.getByLabelText("Remove First Book"));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  test("links the cover and title to Goodreads", () => {
    const view = render(
      <BookCard
        book={{ ...book, isbn: "9786559240630" }}
        onRemove={() => {}}
        onUpdateProgress={() => {}}
        onUpdatePageCount={() => {}}
      />,
    );
    const links = view.getAllByRole("link", {
      name: "View First Book on Goodreads (opens in a new tab)",
    });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe(
        "https://www.goodreads.com/book/isbn/9786559240630",
      );
      expect(link.getAttribute("target")).toBe("_blank");
    }
  });
});
