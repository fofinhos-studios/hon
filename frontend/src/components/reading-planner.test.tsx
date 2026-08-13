import "../test/setup";

import { cleanup, fireEvent, render } from "@testing-library/preact";
import { afterEach, describe, expect, test } from "vitest";
import { addReadingDays, todayISO } from "../domain/schedule";
import type { Book, DayOfWeek } from "../types";
import { ReadingPlanner } from "./reading-planner";

const books: Book[] = [
  {
    id: "a",
    title: "Test Book",
    author: "Test Author",
    page_count: 100,
    cover_url: null,
  },
];

afterEach(cleanup);

describe("ReadingPlanner", () => {
  test("normalizes manually entered pages per day to a positive integer", () => {
    const view = render(<ReadingPlanner books={books} onReorder={() => {}} />);
    const input = view.container.querySelector<HTMLInputElement>("#ppd-input");
    if (!input) throw new Error("Expected pages-per-day input");

    fireEvent.input(input, { target: { value: "1.5" } });

    expect(input.value).toBe("2");
  });

  test("updates pages per day from the slider", () => {
    const view = render(<ReadingPlanner books={books} onReorder={() => {}} />);
    const input = view.container.querySelector<HTMLInputElement>("#ppd-input");
    if (!input) throw new Error("Expected pages-per-day input");

    fireEvent.input(view.getByLabelText("Pages per day slider"), {
      target: { value: "42" },
    });

    expect(input.value).toBe("42");
  });

  test("supports deadlines requiring more than 200 pages per day", () => {
    const view = render(
      <ReadingPlanner
        books={[{ ...books[0], page_count: 1_000 }]}
        onReorder={() => {}}
      />,
    );
    const finishInput =
      view.container.querySelector<HTMLInputElement>("#finish-input");
    const pagesInput =
      view.container.querySelector<HTMLInputElement>("#ppd-input");
    const slider = view.getByLabelText(
      "Pages per day slider",
    ) as HTMLInputElement;
    if (!finishInput || !pagesInput) throw new Error("Expected planner inputs");

    fireEvent.input(finishInput, { target: { value: todayISO() } });

    expect(pagesInput.value).toBe("1000");
    expect(slider.max).toBe("1000");
  });

  test("changing pages updates finish date after deadline mode", () => {
    const view = render(<ReadingPlanner books={books} onReorder={() => {}} />);
    const finishInput =
      view.container.querySelector<HTMLInputElement>("#finish-input");
    const pagesInput =
      view.container.querySelector<HTMLInputElement>("#ppd-input");
    if (!finishInput || !pagesInput) throw new Error("Expected planner inputs");

    fireEvent.input(finishInput, { target: { value: todayISO() } });
    fireEvent.input(pagesInput, { target: { value: "10" } });

    expect(pagesInput.value).toBe("10");
    expect(finishInput.value).not.toBe(todayISO());
  });

  test("changing reading method recalculates deadline-driven pages", () => {
    const plannerBooks = [31, 31, 31].map((page_count, index) => ({
      ...books[0],
      id: String(index),
      page_count,
    }));
    const weekdays: DayOfWeek[] = [0, 1, 2, 3, 4];
    const deadline = addReadingDays(todayISO(), weekdays, 10);
    const view = render(
      <ReadingPlanner books={plannerBooks} onReorder={() => {}} />,
    );
    const finishInput =
      view.container.querySelector<HTMLInputElement>("#finish-input");
    const pagesInput =
      view.container.querySelector<HTMLInputElement>("#ppd-input");
    if (!finishInput || !pagesInput) throw new Error("Expected planner inputs");

    fireEvent.input(finishInput, { target: { value: deadline } });
    expect(pagesInput.value).toBe("11");
    fireEvent.click(view.getByText("Interleaved"));
    expect(pagesInput.value).toBe("10");
  });

  test("changing books recalculates deadline-driven pages", () => {
    const weekdays: DayOfWeek[] = [0, 1, 2, 3, 4];
    const deadline = addReadingDays(todayISO(), weekdays, 10);
    const view = render(<ReadingPlanner books={books} onReorder={() => {}} />);
    const finishInput =
      view.container.querySelector<HTMLInputElement>("#finish-input");
    const pagesInput =
      view.container.querySelector<HTMLInputElement>("#ppd-input");
    if (!finishInput || !pagesInput) throw new Error("Expected planner inputs");

    fireEvent.input(finishInput, { target: { value: deadline } });
    expect(pagesInput.value).toBe("10");
    view.rerender(
      <ReadingPlanner
        books={[{ ...books[0], page_count: 200 }]}
        onReorder={() => {}}
      />,
    );
    expect(pagesInput.value).toBe("20");
  });

  test("warns and disables targets when no reading days are selected", () => {
    const view = render(<ReadingPlanner books={books} onReorder={() => {}} />);

    for (const day of ["Mo", "Tu", "We", "Th", "Fr"]) {
      fireEvent.click(view.getByText(day));
    }

    expect(view.getByRole("alert").textContent).toBe(
      "Select at least one reading day.",
    );
    expect(
      view.getByText("Select reading days to see your schedule."),
    ).toBeTruthy();
    expect(
      view.container.querySelector<HTMLInputElement>("#ppd-input")?.disabled,
    ).toBe(true);
  });

  test("shows a warning for a past finish date", () => {
    const view = render(<ReadingPlanner books={books} onReorder={() => {}} />);
    const finishInput =
      view.container.querySelector<HTMLInputElement>("#finish-input");
    if (!finishInput) throw new Error("Expected finish-date input");

    fireEvent.input(finishInput, { target: { value: "2000-01-01" } });

    expect(view.getByText("Date is in the past.")).toBeTruthy();
  });
});
