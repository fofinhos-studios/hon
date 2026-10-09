import "../test/setup";

import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SeriesSearchResults } from "../features/books/book-search-results";
import { LanguageProvider } from "../i18n";
import type { SearchResult } from "../services/api";
import type { Book, SearchBook, SearchSeries } from "../types";
import { BookSearch } from "./book-search";

const searchBooksMock = vi.fn(
  async (): Promise<SearchResult> => ({
    books: [],
    series: [],
    source: "google_books",
  }),
);

afterEach(cleanup);

beforeEach(() => {
  searchBooksMock.mockReset();
});

test("keeps manual entry beside search and opens it on demand", () => {
  const view = render(
    <BookSearch
      onAdd={() => {}}
      onAddBooks={() => {}}
      searchBooks={searchBooksMock}
    />,
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
  const book: SearchBook = {
    id: "dune",
    title: "Dune",
    author: "Frank Herbert",
    kind: "page",
    format: "unspecified",
    source: "google_books",
    work_key: "dune|frank herbert|und",
    page_count: 412,
    cover_url: null,
  };
  searchBooksMock.mockImplementation(async () => ({
    books: [book],
    series: [],
    source: "google_books",
  }));
  const onAdd = vi.fn((_book: Book) => {});
  const view = render(
    <BookSearch
      onAdd={onAdd}
      onAddBooks={() => {}}
      searchBooks={searchBooksMock}
    />,
  );
  const input = view.getByLabelText("Search books") as HTMLInputElement;

  fireEvent.input(input, { target: { value: "dune" } });
  await waitFor(() => expect(view.getByText("Dune")).toBeTruthy(), {
    timeout: 700,
  });
  fireEvent.click(view.getByRole("button", { name: /Edition.*412 pages/ }));

  const { source: _source, work_key: _workKey, ...selected } = book;
  await waitFor(() =>
    expect(onAdd).toHaveBeenCalledWith({
      ...selected,
      id: "google_books:dune",
    }),
  );
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
    const view = render(
      <BookSearch
        onAdd={() => {}}
        onAddBooks={() => {}}
        searchBooks={search}
      />,
    );
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
        series: [],
        books:
          outcome === "results"
            ? [
                {
                  id: "dune",
                  title: "Dune",
                  author: "Frank Herbert",
                  kind: "page",
                  format: "unspecified",
                  source: "google_books",
                  work_key: "dune|frank herbert|und",
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
    <BookSearch
      onAdd={onAdd}
      onAddBooks={() => {}}
      searchBooks={searchBooksMock}
    />,
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
    kind: "page",
    format: "unspecified",
    page_count: 709,
    cover_url: null,
  });
  expect(view.queryByLabelText("Book name")).toBeNull();
  expect(view.queryByLabelText("Number of pages")).toBeNull();
  expect(document.activeElement).toBe(view.getByLabelText("Search books"));
});

test("keeps an edition without pages and asks for its count before adding", async () => {
  const edition: SearchBook = {
    id: "edition",
    title: "Katábasis",
    author: "R. F. Kuang",
    kind: "page",
    format: "unspecified",
    source: "open_library",
    work_key: "katabasis|r f kuang|pt",
    page_count: null,
    cover_url: "https://covers.openlibrary.org/edition.jpg",
    isbn: "9788551012239",
    publisher: "Intrínseca",
    language: "pt",
  };
  searchBooksMock.mockResolvedValue({
    books: [edition],
    series: [],
    source: "open_library",
  });
  const onAdd = vi.fn();
  const view = render(
    <BookSearch
      onAdd={onAdd}
      onAddBooks={() => {}}
      searchBooks={searchBooksMock}
    />,
  );
  fireEvent.input(view.getByLabelText("Search books"), {
    target: { value: "katabasis" },
  });
  await waitFor(() => expect(view.getByText("Katábasis")).toBeTruthy(), {
    timeout: 1000,
  });
  fireEvent.click(
    view.getByRole("button", { name: /Edition.*Pages not listed/ }),
  );
  expect(onAdd).not.toHaveBeenCalled();
  fireEvent.input(view.getByLabelText("Pages"), { target: { value: "480" } });
  fireEvent.click(view.getByRole("button", { name: "Add edition" }));
  const { source: _source, work_key: _workKey, ...selected } = edition;
  await waitFor(() =>
    expect(onAdd).toHaveBeenCalledWith({
      ...selected,
      id: "open_library:edition",
      page_count: 480,
    }),
  );
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
          kind: "page",
          format: "unspecified",
          source: "google_books",
          work_key: "",
          page_count: 100,
          cover_url: null,
        },
      ],
      series: [],
      source: "combined",
    }),
  );
  const view = render(
    <BookSearch onAdd={() => {}} onAddBooks={() => {}} searchBooks={search} />,
  );
  expect(view.queryByRole("combobox", { name: "Language" })).toBeNull();
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

const seriesMember = (
  id: string,
  title: string,
  position: number | null,
  pageCount: number | null,
): Extract<SearchBook, { kind: "page" }> => ({
  id,
  title,
  author: "Robert Jordan",
  kind: "page",
  format: "physical",
  source: "hardcover",
  work_key: "",
  page_count: pageCount,
  cover_url: null,
  series: { id: "42", name: "The Wheel of Time", position },
});

test("renders ordered series members before ordinary editions and bulk adds selected books once", async () => {
  const series: SearchSeries = {
    id: "42",
    name: "The Wheel of Time",
    author: "Robert Jordan",
    incomplete: true,
    members: [
      seriesMember("hardcover:4", "Unnumbered tale", null, 40),
      seriesMember("hardcover:2", "Second volume", 2, null),
      seriesMember("hardcover:3", "Midway tale", 1.5, 70),
      seriesMember("hardcover:1", "First volume", 1, 300),
      seriesMember("hardcover:0", "Prelude", 0, 80),
    ],
  };
  searchBooksMock.mockResolvedValue({
    series: [series],
    books: [
      {
        ...seriesMember("catalog", "Ordinary result", null, 180),
        source: "google_books",
        format: "unspecified",
        series: null,
      },
    ],
    source: "combined",
  });
  const onAddBooks = vi.fn((_books: Book[]) => {});
  const onAdd = vi.fn((_book: Book) => {});
  const view = render(
    <BookSearch
      onAdd={onAdd}
      onAddBooks={onAddBooks}
      searchBooks={searchBooksMock}
    />,
  );
  const input = view.getByLabelText("Search books");
  fireEvent.input(input, { target: { value: "The Wheel of Time" } });
  await waitFor(() => expect(view.getByText("The Wheel of Time")).toBeTruthy());
  expect(view.getByText("5 books found · 2 main · 3 optional")).toBeTruthy();

  expect(input.getAttribute("aria-controls")).toBe(
    "book-series-results book-search-results",
  );
  const titles = [
    ...view.container.querySelectorAll(".book-search__result-title"),
  ].map((node) => node.textContent);
  expect(titles).toEqual([
    "Prelude",
    "First volume",
    "Midway tale",
    "Second volume",
    "Unnumbered tale",
    "Edition",
  ]);
  expect(view.getByText(/Book 1\.5/)).toBeTruthy();
  expect(view.getByText(/Unnumbered\s*·\s*40 pages/)).toBeTruthy();
  expect(
    view.getByText("Some books may be missing from this series."),
  ).toBeTruthy();
  expect(view.getByText("7 results found")).toBeTruthy();
  fireEvent.click(
    view.getByRole("button", { name: "Add series: The Wheel of Time" }),
  );
  expect(onAddBooks).toHaveBeenCalledTimes(1);
  expect(onAddBooks.mock.calls[0][0].map((book) => book.id)).toEqual([
    "hardcover:1",
  ]);
  expect(onAddBooks.mock.calls[0][0][0]).toMatchObject({
    series: { name: "The Wheel of Time", position: 1 },
    page_count: 300,
  });
  expect(view.getByText(/Not added.*Second volume/)).toBeTruthy();
  expect(view.getByText("First volume")).toBeTruthy();
  expect(onAdd).not.toHaveBeenCalled();

  fireEvent.click(
    view.getByRole("checkbox", {
      name: "Include optional books: The Wheel of Time",
    }),
  );
  fireEvent.click(
    view.getByRole("button", { name: "Add series: The Wheel of Time" }),
  );
  expect(onAddBooks).toHaveBeenCalledTimes(2);
  expect(onAddBooks.mock.calls[1][0].map((book) => book.id)).toEqual([
    "hardcover:0",
    "hardcover:1",
    "hardcover:3",
    "hardcover:4",
  ]);
  expect(view.getByText(/Not added.*Second volume/)).toBeTruthy();
});

test("labels singular main and optional counts in Portuguese", () => {
  localStorage.setItem("hon.locale", "pt-BR");
  try {
    const series: SearchSeries = {
      id: "42",
      name: "The Wheel of Time",
      author: "Robert Jordan",
      incomplete: false,
      members: [
        seriesMember("hardcover:1", "First volume", 1, 300),
        seriesMember("hardcover:0", "Prelude", 0, 80),
      ],
    };
    const props = {
      query: "The Wheel of Time",
      onSelect: () => {},
      onAddSeries: () => {},
    };
    const view = render(
      <LanguageProvider>
        <SeriesSearchResults {...props} series={[series]} />
      </LanguageProvider>,
    );
    expect(
      view.getByText("2 livros encontrados · 1 principal · 1 opcional"),
    ).toBeTruthy();
    view.rerender(
      <LanguageProvider>
        <SeriesSearchResults
          {...props}
          series={[{ ...series, members: series.members.slice(0, 1) }]}
        />
      </LanguageProvider>,
    );
    expect(
      view.getByText("1 livro encontrado · 1 principal · 0 opcionais"),
    ).toBeTruthy();
  } finally {
    localStorage.removeItem("hon.locale");
  }
});

test("keeps a series with no eligible pages visible and prompts on individual add", async () => {
  searchBooksMock.mockResolvedValue({
    series: [
      {
        id: "42",
        name: "The Wheel of Time",
        author: "Robert Jordan",
        incomplete: false,
        members: [seriesMember("hardcover:2", "Second volume", 2, null)],
      },
    ],
    books: [],
    source: "hardcover",
  });
  const onAddBooks = vi.fn();
  const onAdd = vi.fn();
  const view = render(
    <BookSearch
      onAdd={onAdd}
      onAddBooks={onAddBooks}
      searchBooks={searchBooksMock}
    />,
  );
  const input = view.getByLabelText("Search books") as HTMLInputElement;
  fireEvent.input(input, { target: { value: "The Wheel of Time" } });
  await waitFor(() => expect(view.getByText("Second volume")).toBeTruthy());
  expect(input.getAttribute("aria-controls")).toBe("book-series-results");
  expect(
    view.queryByText("No books found. Try a title, author or ISBN."),
  ).toBeNull();
  fireEvent.click(
    view.getByRole("button", { name: "Add series: The Wheel of Time" }),
  );
  expect(onAddBooks).not.toHaveBeenCalled();
  expect(view.getByText(/Not added.*Second volume/)).toBeTruthy();
  fireEvent.click(
    view.getByRole("button", {
      name: /Second volume.*Book 2.*Pages not listed/,
    }),
  );
  expect(input.value).toBe("");
  fireEvent.input(view.getByLabelText("Pages"), { target: { value: "700" } });
  fireEvent.click(view.getByRole("button", { name: "Add edition" }));
  await waitFor(() =>
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "hardcover:2",
        title: "Second volume",
        page_count: 700,
        series: { id: "42", name: "The Wheel of Time", position: 2 },
      }),
    ),
  );
});

test("resets optional selection and warnings with the search query", async () => {
  searchBooksMock.mockImplementation(async () => ({
    series: [
      {
        id: "42",
        name: "The Wheel of Time",
        author: "Robert Jordan",
        incomplete: false,
        members: [
          seriesMember("hardcover:1", "First volume", 1, null),
          seriesMember("hardcover:0", "Prelude", 0, 80),
        ],
      },
    ],
    books: [],
    source: "hardcover",
  }));
  const onAddBooks = vi.fn();
  const view = render(
    <BookSearch
      onAdd={() => {}}
      onAddBooks={onAddBooks}
      searchBooks={searchBooksMock}
    />,
  );
  const input = view.getByLabelText("Search books");
  fireEvent.input(input, { target: { value: "Wheel of Time" } });
  await waitFor(() => expect(view.getByText("First volume")).toBeTruthy());
  const checkbox = view.getByRole("checkbox", {
    name: "Include optional books: The Wheel of Time",
  }) as HTMLInputElement;
  fireEvent.click(checkbox);
  fireEvent.click(
    view.getByRole("button", { name: "Add series: The Wheel of Time" }),
  );
  expect(onAddBooks.mock.calls[0][0].map((book: Book) => book.id)).toEqual([
    "hardcover:0",
  ]);
  expect(view.getByText(/Not added.*First volume/)).toBeTruthy();

  fireEvent.input(input, { target: { value: "Wheel of Time books" } });
  expect(view.queryByText("First volume")).toBeNull();
  await waitFor(() => expect(view.getByText("First volume")).toBeTruthy());
  expect(
    (
      view.getByRole("checkbox", {
        name: "Include optional books: The Wheel of Time",
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
  expect(view.queryByText(/Not added.*First volume/)).toBeNull();
});

test("does not show a no-results message for a partial empty response", async () => {
  searchBooksMock.mockResolvedValue({
    series: [],
    books: [],
    source: "combined",
    partial: true,
  });
  const view = render(
    <BookSearch
      onAdd={() => {}}
      onAddBooks={() => {}}
      searchBooks={searchBooksMock}
    />,
  );
  fireEvent.input(view.getByLabelText("Search books"), {
    target: { value: "unavailable series" },
  });
  await waitFor(() =>
    expect(view.getByText(/Some catalogs are unavailable/)).toBeTruthy(),
  );
  expect(
    view.queryByText("No books found. Try a title, author or ISBN."),
  ).toBeNull();
});

test("keeps optional selection separate for each series", async () => {
  searchBooksMock.mockResolvedValue({
    books: [],
    series: [
      {
        id: "42",
        name: "The Wheel of Time",
        author: "Robert Jordan",
        incomplete: false,
        members: [
          seriesMember("hardcover:1", "First volume", 1, 300),
          seriesMember("hardcover:0", "Prelude", 0, 80),
        ],
      },
      {
        id: "73",
        name: "Another series",
        author: "Another author",
        incomplete: false,
        members: [
          {
            ...seriesMember("hardcover:73", "Another first", 1, 200),
            series: { id: "73", name: "Another series", position: 1 },
          },
        ],
      },
    ],
    source: "hardcover",
  });
  const onAddBooks = vi.fn();
  const view = render(
    <BookSearch
      onAdd={() => {}}
      onAddBooks={onAddBooks}
      searchBooks={searchBooksMock}
    />,
  );
  fireEvent.input(view.getByLabelText("Search books"), {
    target: { value: "series books" },
  });
  await waitFor(() => expect(view.getByText("Another series")).toBeTruthy());
  fireEvent.click(
    view.getByRole("checkbox", {
      name: "Include optional books: The Wheel of Time",
    }),
  );
  expect(
    (
      view.getByRole("checkbox", {
        name: "Include optional books: Another series",
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
  fireEvent.click(
    view.getByRole("button", { name: "Add series: Another series" }),
  );
  expect(onAddBooks.mock.calls[0][0].map((book: Book) => book.id)).toEqual([
    "hardcover:73",
  ]);
});
