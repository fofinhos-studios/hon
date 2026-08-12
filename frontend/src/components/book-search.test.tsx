import "../test/setup";

import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import type { SearchResult } from "../services/api";
import type { Book } from "../types";
import { BookSearch } from "./book-search";

const searchBooksMock = mock(
  async (): Promise<SearchResult> => ({
    books: [],
    source: "google_books",
  }),
);

afterEach(cleanup);

beforeEach(() => {
  searchBooksMock.mockReset();
});

test("labels search and manual entry sections", () => {
  const view = render(<BookSearch onAdd={() => {}} searchBooks={searchBooksMock} />);

  expect(view.getByText("Add book via search")).toBeTruthy();
  expect(view.getByText("or")).toBeTruthy();
  expect(view.getByText("Add book manually")).toBeTruthy();
});

test("adds a selected result and resets search", async () => {
  const book: Book = {
    id: "dune",
    title: "Dune",
    author: "Frank Herbert",
    page_count: 412,
    cover_url: null,
  };
  searchBooksMock.mockImplementation(async () => ({
    books: [book],
    source: "google_books",
  }));
  const onAdd = mock((_book: Book) => {});
  const view = render(<BookSearch onAdd={onAdd} searchBooks={searchBooksMock} />);
  const input = view.getByLabelText("Search books") as HTMLInputElement;

  fireEvent.input(input, { target: { value: "dune" } });
  await waitFor(() => expect(view.getByText("Dune")).toBeTruthy(), {
    timeout: 700,
  });
  fireEvent.click(view.getByRole("button", { name: /Dune/ }));

  expect(onAdd).toHaveBeenCalledWith(book);
  expect(input.value).toBe("");
  expect(view.queryByText("Dune")).toBeNull();
});

test("adds a manual book and clears the form", () => {
  const onAdd = mock((_book: Book) => {});
  const view = render(<BookSearch onAdd={onAdd} searchBooks={searchBooksMock} />);
  const titleInput = view.getByLabelText("Book name") as HTMLInputElement;
  const pagesInput = view.getByLabelText("Number of pages") as HTMLInputElement;

  fireEvent.input(titleInput, { target: { value: "House of Leaves" } });
  fireEvent.input(pagesInput, { target: { value: "709" } });
  fireEvent.click(view.getByRole("button", { name: "Add manual book" }));

  expect(onAdd).toHaveBeenCalledWith({
    id: expect.stringMatching(/^manual-/),
    title: "House of Leaves",
    author: "Manual entry",
    page_count: 709,
    cover_url: null,
  });
  expect(titleInput.value).toBe("");
  expect(pagesInput.value).toBe("");
});
