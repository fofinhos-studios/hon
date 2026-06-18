import "../test/setup";

import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import type { SearchResult } from "../services/api";
import type { Book } from "../types";

const searchBooksMock = mock(
  async (): Promise<SearchResult> => ({
    books: [],
    source: "google_books",
  }),
);

mock.module("../services/api", () => ({
  searchBooks: searchBooksMock,
}));

const { BookSearch } = await import("./book-search");

afterEach(cleanup);

beforeEach(() => {
  searchBooksMock.mockReset();
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
  const view = render(<BookSearch onAdd={onAdd} />);
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
