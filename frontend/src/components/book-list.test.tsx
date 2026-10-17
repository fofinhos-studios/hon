import "../test/setup";

import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Book, SearchBook } from "../types";
import { BookList } from "./book-list";

afterEach(cleanup);

const books: Book[] = [
  {
    id: "a",
    title: "First Book",
    author: "Author A",
    kind: "page",
    format: "unspecified",
    page_count: 100,
    cover_url: null,
  },
  {
    id: "b",
    title: "Second Book",
    author: "Author B",
    kind: "page",
    format: "unspecified",
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
        onSwitchEdition={() => true}
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
        onSwitchEdition={() => true}
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
        onSwitchEdition={() => true}
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
        onSwitchEdition={() => true}
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
  test("restores focus to the replacement card after switching a saved edition", async () => {
    const editions: SearchBook[] = [
      {
        id: "old",
        title: "First Book",
        author: "Author A",
        kind: "page",
        format: "physical",
        page_count: 100,
        cover_url: null,
        source: "catalog",
        work_key: "work-1",
      },
      {
        id: "new:edition",
        title: "First Book",
        author: "Author A",
        kind: "page",
        format: "digital",
        page_count: 130,
        cover_url: null,
        source: "catalog",
        work_key: "work-1",
      },
    ];
    function Library() {
      const [saved, setSaved] = useState<Book[]>([
        {
          ...books[0],
          id: "catalog:old",
          kind: "page",
          format: "physical",
          page_count: 100,
          pages_read: 40,
          available_editions: editions,
        },
        books[1],
      ]);
      return (
        <BookList
          books={saved}
          onRemove={() => {}}
          onUpdateProgress={() => {}}
          onUpdatePageCount={() => {}}
          onSwitchEdition={(id, edition) => {
            if (edition.kind !== "page" || !edition.page_count) return false;
            const total = edition.page_count;
            setSaved((current) =>
              current.map((book) =>
                book.id === id && book.kind === "page"
                  ? {
                      ...book,
                      id: `${edition.source}:${edition.id}`,
                      format: edition.format,
                      page_count: total,
                    }
                  : book,
              ),
            );
            return true;
          }}
        />
      );
    }
    const view = render(<Library />);
    const previousTrigger = view.getByRole("button", {
      name: "Switch edition of First Book",
    });
    fireEvent.click(previousTrigger);
    fireEvent.click(view.getByRole("button", { name: /Digital.*130 pages/ }));
    await waitFor(() => {
      const newTrigger = view.getByRole("button", {
        name: "Switch edition of First Book",
      });
      expect(newTrigger).not.toBe(previousTrigger);
      expect(document.activeElement).toBe(newTrigger);
    });
    expect(
      (
        view.getByRole("spinbutton", {
          name: "Pages read for First Book",
        }) as HTMLInputElement
      ).value,
    ).toBe("40");
    expect(view.getByText("31%")).toBeTruthy();
    expect(view.getByRole("heading", { name: /Second Book/ })).toBeTruthy();
  });
});
