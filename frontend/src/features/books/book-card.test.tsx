import "../../test/setup";

import { cleanup, fireEvent, render } from "@testing-library/preact";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { PageBook, SearchBook } from "../../types";
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
const editions: SearchBook[] = [
  { ...book, source: "catalog", work_key: "work-1" },
  {
    ...book,
    id: "digital",
    format: "digital",
    page_count: 130,
    source: "catalog",
    work_key: "work-1",
  },
  {
    ...book,
    id: "short",
    format: "digital",
    page_count: 20,
    source: "catalog",
    work_key: "work-1",
  },
  {
    ...book,
    id: "unavailable",
    format: "digital",
    page_count: 70,
    source: "catalog",
    work_key: "work-1",
  },
  {
    ...book,
    id: "audio",
    kind: "audiobook",
    duration_minutes: 210,
    narrators: [],
    source: "catalog",
    work_key: "work-1",
  },
];

describe("BookCard", () => {
  test("edits page count with validation and supports cancelling without saving", () => {
    const update = vi.fn();
    const view = render(
      <BookCard
        book={{ ...book, pages_read: 40 }}
        onRemove={() => {}}
        onUpdateProgress={() => {}}
        onUpdatePageCount={update}
        onSwitchEdition={() => true}
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
        onSwitchEdition={() => true}
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
        onSwitchEdition={() => true}
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
        onSwitchEdition={() => true}
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
  test("shows series membership apart from queue position", () => {
    const view = render(
      <BookCard
        book={{
          ...book,
          series: { id: "series-1", name: "The Series", position: 4 },
        }}
        index={0}
        onRemove={() => {}}
        onUpdateProgress={() => {}}
        onUpdatePageCount={() => {}}
        onSwitchEdition={() => true}
      />,
    );
    expect(view.getByText("Book 4 · The Series")).toBeTruthy();
    expect(
      view.container.querySelector(".book-plate__position")?.textContent,
    ).toContain("1");
  });
  test("offers edition switching only for grouped catalog books", () => {
    const view = render(
      <BookCard
        book={book}
        onRemove={() => {}}
        onUpdateProgress={() => {}}
        onUpdatePageCount={() => {}}
        onSwitchEdition={() => true}
      />,
    );
    expect(
      view.queryByRole("button", { name: "Switch edition of First Book" }),
    ).toBeNull();
    view.rerender(
      <BookCard
        book={{ ...book, available_editions: [editions[0]] }}
        onRemove={() => {}}
        onUpdateProgress={() => {}}
        onUpdatePageCount={() => {}}
        onSwitchEdition={() => true}
      />,
    );
    expect(
      view.queryByRole("button", { name: "Switch edition of First Book" }),
    ).toBeNull();
    view.rerender(
      <BookCard
        book={{ ...book, available_editions: editions }}
        onRemove={() => {}}
        onUpdateProgress={() => {}}
        onUpdatePageCount={() => {}}
        onSwitchEdition={() => true}
      />,
    );
    expect(
      view.getByRole("button", { name: "Switch edition of First Book" }),
    ).toBeTruthy();
  });

  test("retains progress, explains rejected editions and restores focus after a valid switch", () => {
    const onSwitchEdition = vi.fn(
      (edition: SearchBook) => edition.id === "digital",
    );
    const view = render(
      <BookCard
        book={{ ...book, pages_read: 40, available_editions: editions }}
        onRemove={() => {}}
        onUpdateProgress={() => {}}
        onUpdatePageCount={() => {}}
        onSwitchEdition={onSwitchEdition}
      />,
    );
    const trigger = view.getByRole("button", {
      name: "Switch edition of First Book",
    });
    fireEvent.click(trigger);
    expect(view.getByRole("dialog")).toBeTruthy();
    fireEvent.click(
      view.getByRole("button", { name: /Audiobook.*210 minutes/ }),
    );
    expect(view.getByRole("alert").textContent).toMatch(/format/i);
    expect(onSwitchEdition).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("button", { name: /Digital.*20 pages/ }));
    expect(view.getByRole("alert").textContent).toMatch(/progress/i);
    expect(onSwitchEdition).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("button", { name: /Digital.*70 pages/ }));
    expect(view.getByRole("alert").textContent).toMatch(/switch/i);
    expect(onSwitchEdition).toHaveBeenCalledWith(editions[3]);
    expect(view.getByRole("dialog")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: /Digital.*130 pages/ }));
    expect(onSwitchEdition).toHaveBeenCalledWith(editions[1]);
    expect(view.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    view.rerender(
      <BookCard
        book={{
          ...book,
          id: "digital",
          format: "digital",
          page_count: 130,
          pages_read: 40,
          available_editions: editions,
        }}
        onRemove={() => {}}
        onUpdateProgress={() => {}}
        onUpdatePageCount={() => {}}
        onSwitchEdition={onSwitchEdition}
      />,
    );
    expect(
      (
        view.getByRole("spinbutton", {
          name: "Pages read for First Book",
        }) as HTMLInputElement
      ).value,
    ).toBe("40");
    expect(view.getByText("31%")).toBeTruthy();
  });
});
