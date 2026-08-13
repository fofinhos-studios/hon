import "../test/setup";

import { cleanup, render } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { afterEach, describe, expect, test } from "vitest";
import { calculateSchedule } from "../domain/schedule";
import type { Book } from "../types";
import { ScheduleView } from "./schedule-view";

afterEach(cleanup);

const initialBooks: Book[] = [
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

function ScheduleHarness() {
  const [books, setBooks] = useState(initialBooks);
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
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      Array.from(
        view.getByRole("list", { name: "Your books" }).querySelectorAll("li"),
      ).map((item) => item.textContent),
    ).toEqual(["Second Book", "First Book"]);
  });
});
