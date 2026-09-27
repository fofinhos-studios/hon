import "./test/setup";

import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/preact";
import { afterEach, expect, test } from "vitest";
import { App } from "./app";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

test("renders the reading planner home page", () => {
  const view = render(<App />);

  expect(view.getByText("reading planner")).toBeTruthy();
  expect(view.getByRole("heading", { name: "Your books" })).toBeTruthy();
});

test("saving total pages persists the edit and recalculates progress and schedule", async () => {
  localStorage.setItem(
    "hon.books",
    JSON.stringify([
      {
        id: "edit",
        title: "Editable book",
        author: "Author",
        page_count: 100,
        pages_read: 40,
        cover_url: null,
        visuals: { dominant_color: "#aabbcc", artwork: null },
      },
    ]),
  );
  const view = render(<App />);
  fireEvent.click(
    view.getByRole("button", { name: "Edit page count for Editable book" }),
  );
  fireEvent.input(view.getByLabelText("Total pages for Editable book"), {
    target: { value: "200" },
  });
  fireEvent.click(view.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(
      JSON.parse(localStorage.getItem("hon.books") || "[]")[0].page_count,
    ).toBe(200),
  );
  expect(
    (
      view.getByLabelText(
        "Percentage read for Editable book",
      ) as HTMLInputElement
    ).value,
  ).toBe("20");
  expect(
    within(view.getByLabelText("Reading schedule")).getByText("40 / 200 pp"),
  ).toBeTruthy();
  expect(
    within(view.getByLabelText("Reading schedule")).getByText(
      /1 book · 160 pages ·/,
    ),
  ).toBeTruthy();
});
