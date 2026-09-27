import "../test/setup";

import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { SearchResult } from "../services/api";
import type { Book } from "../types";
import { BookSearch } from "./book-search";

const searchBooksMock = vi.fn(
  async (): Promise<SearchResult> => ({
    books: [],
    source: "google_books",
  }),
);

afterEach(cleanup);

beforeEach(() => {
  searchBooksMock.mockReset();
});

test("keeps manual entry beside search and opens it on demand", () => {
  const view = render(
    <BookSearch onAdd={() => {}} searchBooks={searchBooksMock} />,
  );

  expect(view.getByText("Find a book")).toBeTruthy();
  expect(view.queryByLabelText("Book name")).toBeNull();
  const toggle = view.getByRole("button", { name: "Add manually" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(view.getByLabelText("Book name")).toBeTruthy();
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
  const onAdd = vi.fn((_book: Book) => {});
  const view = render(
    <BookSearch onAdd={onAdd} searchBooks={searchBooksMock} />,
  );
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

test.each(["results", "empty", "error"])(
  "replaces the clear action while loading and restores it after %s",
  async (outcome) => {
    let finish: (value: SearchResult) => void = () => {};
    let fail: (reason: Error) => void = () => {};
    const search = vi.fn(
      () =>
        new Promise<SearchResult>((resolve, reject) => {
          finish = resolve;
          fail = reject;
        }),
    );
    const view = render(<BookSearch onAdd={() => {}} searchBooks={search} />);
    const input = view.getByLabelText("Search books") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "dune" } });
    expect(input.getAttribute("aria-busy")).toBe("true");
    expect(view.queryByRole("button", { name: "Clear search" })).toBeNull();
    expect(view.getByRole("status").textContent).toBe("Searching catalogs…");
    await waitFor(() => expect(search).toHaveBeenCalled());
    if (outcome === "error") fail(new Error("Catalog unavailable"));
    else
      finish({
        source: "combined",
        books:
          outcome === "results"
            ? [
                {
                  id: "dune",
                  title: "Dune",
                  author: "Frank Herbert",
                  page_count: 412,
                  cover_url: null,
                },
              ]
            : [],
      });
    await waitFor(() => expect(input.getAttribute("aria-busy")).toBe("false"));
    expect(view.queryByRole("status")).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "Clear search" }));
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
    expect(view.queryByText("Dune")).toBeNull();
    expect(view.queryByRole("alert")).toBeNull();
  },
);

test("adds a manual book and clears the form", () => {
  const onAdd = vi.fn((_book: Book) => {});
  const view = render(
    <BookSearch onAdd={onAdd} searchBooks={searchBooksMock} />,
  );
  fireEvent.click(view.getByRole("button", { name: "Add manually" }));
  const titleInput = view.getByLabelText("Book name") as HTMLInputElement;
  const pagesInput = view.getByLabelText("Number of pages") as HTMLInputElement;

  fireEvent.input(titleInput, { target: { value: "House of Leaves" } });
  fireEvent.input(pagesInput, { target: { value: "12.5" } });
  expect(
    view.getByRole("button", { name: "Add book" }).hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.input(pagesInput, { target: { value: "709" } });
  fireEvent.click(view.getByRole("button", { name: "Add book" }));

  expect(onAdd).toHaveBeenCalledWith({
    id: expect.stringMatching(/^manual-/),
    title: "House of Leaves",
    author: "Manual entry",
    page_count: 709,
    cover_url: null,
  });
  expect(view.queryByLabelText("Book name")).toBeNull();
  expect(view.queryByLabelText("Number of pages")).toBeNull();
  expect(document.activeElement).toBe(view.getByLabelText("Search books"));
});

test("keeps an edition without pages and asks for its count before adding", async () => {
  const edition = {
    id: "edition",
    title: "Katábasis",
    author: "R. F. Kuang",
    page_count: null,
    cover_url: "https://covers.openlibrary.org/edition.jpg",
    isbn: "9788551012239",
    publisher: "Intrínseca",
    language: "pt",
  };
  searchBooksMock.mockResolvedValue({
    books: [edition],
    source: "open_library",
  });
  const onAdd = vi.fn();
  const view = render(
    <BookSearch onAdd={onAdd} searchBooks={searchBooksMock} />,
  );
  fireEvent.input(view.getByLabelText("Search books"), {
    target: { value: "katabasis" },
  });
  await waitFor(() => expect(view.getByText("Katábasis")).toBeTruthy(), {
    timeout: 1000,
  });
  fireEvent.click(view.getByRole("button", { name: /Katábasis/ }));
  expect(onAdd).not.toHaveBeenCalled();
  fireEvent.input(view.getByLabelText("Pages"), { target: { value: "480" } });
  fireEvent.click(view.getByRole("button", { name: "Add edition" }));
  expect(onAdd).toHaveBeenCalledWith({ ...edition, page_count: 480 });
  expect(view.queryByRole("button", { name: "Add edition" })).toBeNull();
});

test("searches the typed title without a language selector or restriction", async () => {
  const search = vi.fn(
    async (query: string): Promise<SearchResult> => ({
      books: [
        {
          id: query,
          title: query,
          author: "Author",
          page_count: 100,
          cover_url: null,
        },
      ],
      source: "combined",
    }),
  );
  const view = render(<BookSearch onAdd={() => {}} searchBooks={search} />);
  expect(view.queryByRole("combobox")).toBeNull();
  const input = view.getByLabelText("Search books");
  fireEvent.input(input, { target: { value: "Antes que o cafe esfrie" } });
  await waitFor(() =>
    expect(view.getByText("Antes que o cafe esfrie")).toBeTruthy(),
  );
  fireEvent.input(input, { target: { value: "Before the coffee gets cold" } });
  expect(view.queryByText("Antes que o cafe esfrie")).toBeNull();
  await waitFor(() =>
    expect(view.getByText("Before the coffee gets cold")).toBeTruthy(),
  );
  expect(search).toHaveBeenLastCalledWith("Before the coffee gets cold", {
    signal: expect.any(AbortSignal),
  });
});
