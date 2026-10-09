import "../test/setup";

import { cleanup, fireEvent, render, within } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { afterEach, describe, expect, test } from "vitest";
import { calculateSchedule } from "../domain/schedule";
import type { Book, PageBook } from "../types";
import { ScheduleView } from "./schedule-view";

afterEach(cleanup);

const initialBooks: PageBook[] = [
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

function ScheduleHarness() {
  const [books, setBooks] = useState<Book[]>(initialBooks);
  const schedule = calculateSchedule(
    books,
    [0, 1, 2, 3, 4, 5, 6],
    30,
    "sequential",
    "2026-01-05",
  );

  return (
    <>
      <ScheduleView
        books={books}
        result={schedule}
        pagesPerDay={30}
        method="sequential"
        onReorder={setBooks}
      />
      <ol aria-label="Your books">
        {books.map((book) => (
          <li key={book.id}>{book.title}</li>
        ))}
      </ol>
    </>
  );
}

describe("ScheduleView", () => {
  test("defaults to colored spines and preserves the expanded card design", () => {
    const view = render(<ScheduleHarness />);
    const list = view.getByRole("list", { name: "Reorder your schedule" });
    const first = list.querySelector<HTMLElement>('[data-book-id="a"]');
    const initialColor = first?.style.getPropertyValue("--book-fallback");
    expect(
      view
        .getByRole("button", { name: "Expand cards" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(within(list).getByText("Author A")).toBeTruthy();
    expect(within(list).getByText("100 pp")).toBeTruthy();
    expect(view.getByText(/2 books · 300 pages ·/)).toBeTruthy();
    expect(
      list.querySelector(".schedule-view__spine-number")?.textContent,
    ).toContain("1");
    expect(
      list.querySelector(".schedule-view__spine-number")?.textContent,
    ).not.toContain("01");
    expect(list.querySelector(".schedule-view__cover")).toBeNull();
    expect(
      within(list).getByRole("link", {
        name: "View First Book on Goodreads (opens in a new tab)",
      }),
    ).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Expand cards" }));
    expect(
      view
        .getByRole("button", { name: "Collapse cards" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(list.querySelectorAll(".schedule-view__cover")).toHaveLength(2);
    expect(
      within(list).getAllByRole("link", {
        name: "View First Book on Goodreads (opens in a new tab)",
      }),
    ).toHaveLength(2);
    expect(list.querySelector(".schedule-view__spine-number")).toBeNull();
    expect(within(list).queryByText("Author A")).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "Collapse cards" }));
    fireEvent.click(
      within(list).getByRole("button", { name: "Move First Book down" }),
    );
    expect(list.querySelector("li")?.getAttribute("data-book-id")).toBe("b");
    expect(
      list
        .querySelector<HTMLElement>('[data-book-id="a"]')
        ?.style.getPropertyValue("--book-fallback"),
    ).toBe(initialColor);
    expect(view.getByRole("button", { name: "Expand cards" })).toBeTruthy();
  });

  test("shows saved series number on expanded schedule separately from queue order", () => {
    const books: Book[] = [
      {
        ...initialBooks[0],
        series: { id: "s1", name: "The Series", position: 4 },
      },
    ];
    const schedule = calculateSchedule(
      books,
      [0, 1, 2, 3, 4, 5, 6],
      30,
      "sequential",
      "2026-01-05",
    );
    const view = render(
      <ScheduleView
        books={books}
        result={schedule}
        pagesPerDay={30}
        method="sequential"
        onReorder={() => {}}
      />,
    );
    fireEvent.click(view.getByRole("button", { name: "Expand cards" }));
    expect(view.getByText("Book 4 · The Series")).toBeTruthy();
    expect(
      view.container.querySelector(".schedule-view__station")?.textContent,
    ).toContain("1");
  });

  test("reorders the shared book list when a schedule row is dragged", async () => {
    const view = render(<ScheduleHarness />);
    const first = view.container.querySelector<HTMLElement>(
      '.schedule-view__item[data-book-id="a"]',
    );
    const second = view.container.querySelector<HTMLElement>(
      '.schedule-view__item[data-book-id="b"]',
    );
    if (!first || !second) throw new Error("Expected schedule rows");

    Object.defineProperty(first, "getBoundingClientRect", {
      value: () => ({ top: 0, height: 100 }),
      configurable: true,
    });
    Object.defineProperty(second, "getBoundingClientRect", {
      value: () => ({ top: 112, height: 100 }),
      configurable: true,
    });

    const handle = first.querySelector(".reorder-handle");
    if (!handle) throw new Error("Expected drag handle");
    handle.dispatchEvent(
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
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      Array.from(
        view.getByRole("list", { name: "Your books" }).querySelectorAll("li"),
      ).map((item) => item.textContent),
    ).toEqual(["Second Book", "First Book"]);
  });
});

test("shows the edition cover and an accessible placeholder in the schedule", () => {
  const books = [
    {
      ...initialBooks[0],
      cover_url: "https://covers.openlibrary.org/edition.jpg",
    },
    initialBooks[1],
  ];
  const result = calculateSchedule(
    books,
    [0, 1, 2, 3, 4],
    30,
    "sequential",
    "2026-01-05",
  );
  const view = render(
    <ScheduleView
      books={books}
      result={result}
      pagesPerDay={30}
      method="sequential"
      onReorder={() => {}}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Expand cards" }));
  expect(
    view.getByAltText("Cover of First Book").getAttribute("src"),
  ).toContain("edition.jpg");
  fireEvent.error(view.getByAltText("Cover of Second Book"));
  expect(view.getByLabelText("No cover for Second Book")).toBeTruthy();
});

test("uses the library artwork as the compact and expanded card backdrop", () => {
  const books = [
    {
      ...initialBooks[0],
      cover_url: "https://covers.openlibrary.org/edition.jpg",
      visuals: {
        dominant_color: "#112233",
        artwork: {
          image_url: "https://upload.wikimedia.org/art.jpg",
          source_url: "https://commons.wikimedia.org/wiki/File:Art",
          author: "Artist",
          license: "CC BY-SA 4.0",
        },
      },
    },
  ];
  const result = calculateSchedule(
    books,
    [0, 1, 2, 3, 4],
    30,
    "sequential",
    "2026-01-05",
  );
  const view = render(
    <ScheduleView
      books={books}
      result={result}
      pagesPerDay={30}
      method="sequential"
      onReorder={() => {}}
    />,
  );
  const backdrop = view.container.querySelector<HTMLImageElement>(
    ".schedule-view__item .book-backdrop",
  );
  expect(backdrop?.getAttribute("src")).toContain("art.jpg");
  fireEvent.click(view.getByRole("button", { name: "Expand cards" }));
  expect(
    view.container
      .querySelector(".schedule-view__item .book-backdrop")
      ?.getAttribute("src"),
  ).toContain("art.jpg");
  expect(
    view.getByAltText("Cover of First Book").getAttribute("src"),
  ).toContain("edition.jpg");
  fireEvent.error(backdrop as HTMLImageElement);
  expect(
    view.container
      .querySelector(".schedule-view__item .book-backdrop")
      ?.getAttribute("src"),
  ).toContain("edition.jpg");
});

test("compact interleaved cards retain progress and each book's daily pace", () => {
  const books = [{ ...initialBooks[0], pages_read: 25 }, initialBooks[1]];
  const result = calculateSchedule(
    books,
    [0, 1, 2, 3, 4],
    30,
    "interleaved",
    "2026-01-05",
  );
  const view = render(
    <ScheduleView
      books={books}
      result={result}
      pagesPerDay={30}
      method="interleaved"
      onReorder={() => {}}
    />,
  );
  expect(
    view.container.querySelector(
      ".schedule-view--compact.schedule-view--interleaved",
    ),
  ).toBeTruthy();
  expect(view.getByText("25 / 100 pp")).toBeTruthy();
  const first = view.container.querySelector('[data-book-id="a"]');
  expect(first?.textContent).toContain(
    `About ${result.books[0].daily_pages} pages/day`,
  );
  expect(
    first?.querySelector(".schedule-view__spine-dates")?.textContent,
  ).toContain("Jan 5, 2026");
});
