import { setTimeout as delay } from "node:timers/promises";
import "../test/setup";

import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
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
const searchSeriesMock = vi.fn(
  async (): Promise<SearchResult> => ({
    books: [],
    series: [],
    source: "hardcover",
  }),
);

afterEach(cleanup);

beforeEach(() => {
  searchBooksMock.mockReset();
  searchSeriesMock.mockReset();
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
  expect(
    view.container.querySelector(".book-search__result-series"),
  ).toBeNull();
  fireEvent.click(view.getByRole("button", { name: /Dune.*412 pages/ }));

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

test("adds a selected edition without waiting for optional artwork", async () => {
  const request = vi.spyOn(globalThis, "fetch").mockReturnValue(Promise.race<Response>([]));
  searchBooksMock.mockResolvedValue({
    books: [{
      id: "dune-slow-artwork",
      title: "Dune",
      author: "Frank Herbert",
      kind: "page",
      format: "physical",
      source: "google_books",
      work_key: "dune|frank herbert|en",
      page_count: 412,
      cover_url: null,
    }],
    series: [],
    source: "google_books",
  });
  try {
    const onAdd = vi.fn((_book: Book) => {});
    const view = render(
      <BookSearch
        onAdd={onAdd}
        onAddBooks={() => {}}
        searchBooks={searchBooksMock}
      />,
    );
    fireEvent.input(view.getByLabelText("Search books"), {
      target: { value: "dune" },
    });
    const result = await waitFor(
      () => view.getByRole("button", { name: /Dune.*412 pages/ }),
      { timeout: 700 },
    );
    fireEvent.click(result);
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({ id: "google_books:dune-slow-artwork" }),
      ),
    );
  } finally {
    request.mockRestore();
  }
});

test("does not request artwork for search results before a book is selected", async () => {
  const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ dominant_color: null, artwork: null }), { status: 200 }),
  );
  searchBooksMock.mockResolvedValue({
    books: [{
      id: "foundation-search-result",
      title: "Foundation",
      author: "Isaac Asimov",
      kind: "page",
      format: "physical",
      source: "open_library",
      work_key: "foundation|isaac asimov|en",
      page_count: 255,
      cover_url: null,
    }],
    series: [],
    source: "open_library",
  });
  try {
    const view = render(
      <BookSearch
        onAdd={() => {}}
        onAddBooks={() => {}}
        searchBooks={searchBooksMock}
      />,
    );
    fireEvent.input(view.getByLabelText("Search books"), {
      target: { value: "foundation" },
    });
    await waitFor(() => expect(view.getByText("Foundation")).toBeTruthy(), {
      timeout: 700,
    });
    await act(async () => {
      await delay(120);
    });
    expect(request).not.toHaveBeenCalled();
  } finally {
    request.mockRestore();
  }
});

test("filters editions above the search field without losing the query", async () => {
  searchBooksMock.mockResolvedValue({
    books: [],
    series: [],
    source: "combined",
  });
  const view = render(
    <BookSearch
      onAdd={() => {}}
      onAddBooks={() => {}}
      searchBooks={searchBooksMock}
    />,
  );
  const filter = view.getByRole("group", { name: "Filter by edition" });
  for (const label of [
    "All",
    "Physical",
    "Digital",
    "Unspecified",
    "Audiobook",
  ]) {
    expect(view.getByRole("button", { name: label })).toBeTruthy();
  }
  const input = view.getByLabelText("Search books") as HTMLInputElement;
  expect(
    filter.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  fireEvent.input(input, { target: { value: "dune" } });
  fireEvent.click(view.getByRole("button", { name: "Physical" }));
  await waitFor(() =>
    expect(searchBooksMock).toHaveBeenLastCalledWith("dune", {
      signal: expect.any(AbortSignal),
      edition_type: "physical",
    }),
  );
  expect(input.value).toBe("dune");
  fireEvent.click(view.getByRole("button", { name: "All" }));
  await waitFor(() =>
    expect(searchBooksMock).toHaveBeenLastCalledWith("dune", {
      signal: expect.any(AbortSignal),
    }),
  );
  fireEvent.click(view.getByRole("button", { name: "Clear search" }));
  expect(input.value).toBe("");
  expect(searchBooksMock).toHaveBeenCalledTimes(2);
});

test("saves valid alternative editions when selecting a work", async () => {
  const physical: SearchBook = {
    id: "print",
    title: "Dune",
    author: "Frank Herbert",
    kind: "page",
    format: "physical",
    source: "google_books",
    work_key: "dune|frank herbert|und",
    page_count: 412,
    cover_url: null,
  };
  const digital: SearchBook = {
    ...physical,
    id: "ebook",
    format: "digital",
    page_count: 430,
  };
  const missing: SearchBook = {
    ...physical,
    id: "unknown",
    format: "unspecified",
    page_count: null,
  };
  searchBooksMock.mockResolvedValue({
    books: [physical, digital, missing],
    series: [],
    source: "combined",
  });
  const onAdd = vi.fn();
  const view = render(
    <BookSearch
      onAdd={onAdd}
      onAddBooks={() => {}}
      searchBooks={searchBooksMock}
    />,
  );
  const input = view.getByLabelText("Search books") as HTMLInputElement;
  fireEvent.input(input, { target: { value: "dune" } });
  await waitFor(() => expect(view.getByText("3 editions")).toBeTruthy());
  fireEvent.click(
    view.container.querySelector(".book-search__result") as HTMLButtonElement,
  );
  expect(input.value).toBe("dune");
  fireEvent.click(view.getByRole("button", { name: /Physical.*412 pages/ }));
  await waitFor(() =>
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "google_books:print",
        available_editions: [physical, digital],
      }),
    ),
  );
  expect(input.value).toBe("");
});

test("keeps alternative editions when supplying a selected edition's missing pages", async () => {
  const physical: SearchBook = {
    id: "print",
    title: "Dune",
    author: "Frank Herbert",
    kind: "page",
    format: "physical",
    source: "google_books",
    work_key: "dune|frank herbert|und",
    page_count: 412,
    cover_url: null,
  };
  const unknown: SearchBook = {
    ...physical,
    id: "unknown",
    format: "unspecified",
    page_count: null,
  };
  searchBooksMock.mockResolvedValue({
    books: [physical, unknown],
    series: [],
    source: "combined",
  });
  const onAdd = vi.fn();
  const view = render(
    <BookSearch
      onAdd={onAdd}
      onAddBooks={() => {}}
      searchBooks={searchBooksMock}
    />,
  );
  const input = view.getByLabelText("Search books") as HTMLInputElement;
  fireEvent.input(input, { target: { value: "dune" } });
  await waitFor(() => expect(view.getByText("2 editions")).toBeTruthy());
  fireEvent.click(
    view.container.querySelector(".book-search__result") as HTMLButtonElement,
  );
  fireEvent.click(
    view.getByRole("button", { name: /Edition.*Pages not listed/ }),
  );
  expect(input.value).toBe("dune");
  fireEvent.input(view.getByLabelText("Pages"), { target: { value: "450" } });
  fireEvent.click(view.getByRole("button", { name: "Add edition" }));
  await waitFor(() =>
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "google_books:unknown",
        available_editions: [physical, { ...unknown, page_count: 450 }],
      }),
    ),
  );
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
    view.getByRole("button", { name: /Katábasis.*Pages not listed/ }),
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

test("shows ordinary edition membership and retains it after entering missing pages", async () => {
  const edition: SearchBook = {
    id: "ordinary-edition",
    title: "A Series Novel",
    author: "An Author",
    kind: "page",
    format: "physical",
    source: "open_library",
    work_key: "a series novel|an author|en",
    page_count: null,
    cover_url: null,
    isbn: "9781234567897",
    series: { id: "series-8", name: "The Long Series", position: 1.5 },
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
  const input = view.getByLabelText("Search books") as HTMLInputElement;
  fireEvent.input(input, { target: { value: "A Series Novel" } });
  await waitFor(() => expect(view.getByText("A Series Novel")).toBeTruthy());
  const result = view.getByRole("button", {
    name: /A Series Novel.*Book 1\.5 · The Long Series.*Pages not listed/,
  });
  expect(result.querySelector(".book-search__result-series")?.textContent).toBe(
    "Book 1.5 · The Long Series",
  );
  fireEvent.click(result);
  expect(input.value).toBe("A Series Novel");
  expect(onAdd).not.toHaveBeenCalled();
  const pages = view.getByLabelText("Pages") as HTMLInputElement;
  await waitFor(() => expect(document.activeElement).toBe(pages));
  fireEvent.input(pages, { target: { value: "321" } });
  fireEvent.click(view.getByRole("button", { name: "Add edition" }));
  await waitFor(() =>
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "open_library:ordinary-edition",
        page_count: 321,
        isbn: "9781234567897",
        format: "physical",
        series: { id: "series-8", name: "The Long Series", position: 1.5 },
      }),
    ),
  );
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

test("isolates books and series, retains query and edition filter, and adds a series", async () => {
  const series: SearchSeries = {
    id: "42",
    name: "The Wheel of Time",
    author: "Robert Jordan",
    incomplete: true,
    members: [
      seriesMember("hardcover:2", "Second volume", 2, null),
      seriesMember("hardcover:1", "First volume", 1, 300),
      seriesMember("hardcover:0", "Prelude", 0, 80),
    ],
  };
  searchBooksMock.mockResolvedValue({
    series: [series],
    books: [seriesMember("hardcover:1", "First volume", 1, 300)],
    source: "combined",
  });
  searchSeriesMock.mockResolvedValue({
    series: [series],
    books: [seriesMember("hardcover:1", "First volume", 1, 300)],
    source: "hardcover",
  });
  const onAddBooks = vi.fn((_books: Book[]) => {});
  const view = render(
    <BookSearch
      onAdd={() => {}}
      onAddBooks={onAddBooks}
      searchBooks={searchBooksMock}
      searchSeries={searchSeriesMock}
    />,
  );
  const categories = view.getByRole("group", { name: "Search category" });
  const books = view.getByRole("button", { name: "Book" });
  const seriesTab = view.getByRole("button", { name: "Series" });
  expect(categories.contains(books)).toBe(true);
  expect(books.tagName).toBe("BUTTON");
  expect(seriesTab.tabIndex).toBe(0);
  expect(books.getAttribute("aria-pressed")).toBe("true");
  expect(seriesTab.getAttribute("aria-pressed")).toBe("false");
  const input = view.getByLabelText("Search books") as HTMLInputElement;
  fireEvent.input(input, { target: { value: "The Wheel of Time" } });
  fireEvent.click(view.getByRole("button", { name: "Physical" }));
  await waitFor(() =>
    expect(
      view.getByRole("button", { name: /First volume.*300 pages/ }),
    ).toBeTruthy(),
  );
  expect(searchBooksMock).toHaveBeenLastCalledWith("The Wheel of Time", {
    signal: expect.any(AbortSignal),
    edition_type: "physical",
  });
  expect(searchSeriesMock).not.toHaveBeenCalled();
  expect(view.container.querySelectorAll(".book-search__series")).toHaveLength(
    0,
  );
  expect(view.getByText("1 result found")).toBeTruthy();
  expect(input.getAttribute("aria-controls")).toBe("book-search-results");
  fireEvent.click(seriesTab);
  expect(seriesTab.getAttribute("aria-pressed")).toBe("true");
  expect(books.getAttribute("aria-pressed")).toBe("false");
  expect(view.queryByRole("group", { name: "Filter by edition" })).toBeNull();
  expect(view.queryByRole("button", { name: "Add manually" })).toBeNull();
  expect(view.queryByText("First volume")).toBeNull();
  expect(input.value).toBe("The Wheel of Time");
  expect(input.getAttribute("aria-label")).toBe("Search series");
  expect(input.placeholder).toBe("Series title or author");
  expect(input.getAttribute("aria-controls")).toBeNull();
  await waitFor(() =>
    expect(
      view.getByRole("button", { name: "Add series: The Wheel of Time" }),
    ).toBeTruthy(),
  );
  expect(searchSeriesMock).toHaveBeenLastCalledWith("The Wheel of Time", {
    signal: expect.any(AbortSignal),
  });
  expect(view.container.querySelectorAll(".book-search__work")).toHaveLength(0);
  expect(view.getByText("1 result found")).toBeTruthy();
  expect(input.getAttribute("aria-controls")).toBe("book-series-results");
  fireEvent.click(
    view.getByRole("button", { name: "Add series: The Wheel of Time" }),
  );
  expect(onAddBooks.mock.calls[0][0].map((book) => book.id)).toEqual([
    "hardcover:1",
  ]);
  expect(view.getByText(/Not added.*Second volume/)).toBeTruthy();
  fireEvent.click(
    view.getByRole("checkbox", {
      name: "Include optional books: The Wheel of Time",
    }),
  );
  fireEvent.click(
    view.getByRole("button", { name: "Add series: The Wheel of Time" }),
  );
  expect(onAddBooks.mock.calls[1][0].map((book) => book.id)).toEqual([
    "hardcover:0",
    "hardcover:1",
  ]);
  fireEvent.click(books);
  expect(view.getByRole("group", { name: "Filter by edition" })).toBeTruthy();
  expect(
    view.getByRole("button", { name: "Physical" }).getAttribute("aria-pressed"),
  ).toBe("true");
  expect(input.value).toBe("The Wheel of Time");
  expect(input.getAttribute("aria-label")).toBe("Search books");
  expect(view.queryByText("The Wheel of Time")).toBeNull();
  await waitFor(() => expect(searchBooksMock).toHaveBeenCalledTimes(2));
  expect(searchBooksMock).toHaveBeenLastCalledWith("The Wheel of Time", {
    signal: expect.any(AbortSignal),
    edition_type: "physical",
  });
  fireEvent.click(seriesTab);
  await waitFor(() =>
    expect(
      view.getByRole("checkbox", {
        name: "Include optional books: The Wheel of Time",
      }),
    ).toBeTruthy(),
  );
  expect(
    (
      view.getByRole("checkbox", {
        name: "Include optional books: The Wheel of Time",
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
});

test("requires opting in before adding a series with only optional books", () => {
  const series: SearchSeries = {
    id: "42",
    name: "The Wheel of Time",
    author: "Robert Jordan",
    incomplete: false,
    members: [
      seriesMember("hardcover:3", "Midway tale", 1.5, 70),
      seriesMember("hardcover:0", "Prelude", 0, 80),
    ],
  };
  const onAddSeries = vi.fn();
  const view = render(
    <LanguageProvider>
      <SeriesSearchResults
        series={[series]}
        query="The Wheel of Time"
        onAddSeries={onAddSeries}
      />
    </LanguageProvider>,
  );

  expect(view.getByText("2 books found · 0 main · 2 optional")).toBeTruthy();
  expect(view.queryByText("Prelude")).toBeNull();
  const add = view.getByRole("button", {
    name: "Add series: The Wheel of Time",
  }) as HTMLButtonElement;
  expect(add.disabled).toBe(true);
  fireEvent.click(
    view.getByRole("checkbox", {
      name: "Include optional books: The Wheel of Time",
    }),
  );
  expect(view.queryByText("Prelude")).toBeNull();
  expect(add.disabled).toBe(false);
  fireEvent.click(add);
  expect(onAddSeries.mock.calls[0][0].map((book: Book) => book.id)).toEqual([
    "hardcover:0",
    "hardcover:3",
  ]);
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

test("keeps book page entry without showing a stray series row", async () => {
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
    books: [seriesMember("hardcover:2", "Second volume", 2, null)],
    source: "hardcover",
  });
  const onAdd = vi.fn();
  const view = render(
    <BookSearch
      onAdd={onAdd}
      onAddBooks={() => {}}
      searchBooks={searchBooksMock}
    />,
  );
  const input = view.getByLabelText("Search books") as HTMLInputElement;
  fireEvent.input(input, { target: { value: "The Wheel of Time" } });
  await waitFor(() => expect(view.getByText("Second volume")).toBeTruthy());
  expect(view.getByText("1 result found")).toBeTruthy();
  expect(view.container.querySelector(".book-search__series")).toBeNull();
  fireEvent.click(
    view.getByRole("button", {
      name: /Second volume.*Book 2.*Pages not listed/,
    }),
  );
  expect(input.value).toBe("The Wheel of Time");
  fireEvent.input(view.getByLabelText("Pages"), { target: { value: "700" } });
  fireEvent.click(view.getByRole("button", { name: "Add edition" }));
  await waitFor(() =>
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "hardcover:2",
        page_count: 700,
        series: { id: "42", name: "The Wheel of Time", position: 2 },
      }),
    ),
  );
});

test("resets optional selection and warnings with the search query", async () => {
  searchSeriesMock.mockImplementation(async () => ({
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
      searchSeries={searchSeriesMock}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Series" }));
  const input = view.getByLabelText("Search series");
  fireEvent.input(input, { target: { value: "Wheel of Time" } });
  await waitFor(() => expect(view.getByText("The Wheel of Time")).toBeTruthy());
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
  expect(view.queryByText("The Wheel of Time")).toBeNull();
  await waitFor(() => expect(view.getByText("The Wheel of Time")).toBeTruthy());
  expect(
    (
      view.getByRole("checkbox", {
        name: "Include optional books: The Wheel of Time",
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
  expect(view.queryByText("Prelude")).toBeNull();
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
  searchSeriesMock.mockResolvedValue({
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
      searchSeries={searchSeriesMock}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Series" }));
  fireEvent.input(view.getByLabelText("Search series"), {
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

test("groups Babel editions into one book card without an unrelated series row", async () => {
  const babel: SearchBook = {
    id: "babel-en",
    title: "Babel",
    author: "R. F. Kuang",
    kind: "page",
    format: "physical",
    source: "google_books",
    work_key: "babel|r f kuang|en",
    language: "en",
    page_count: 544,
    cover_url: null,
  };
  searchBooksMock.mockResolvedValue({
    books: [
      babel,
      {
        ...babel,
        id: "babel-pt",
        language: "pt",
        work_key: "babel|r f kuang|pt",
      },
    ],
    series: [
      {
        id: "other-babel",
        name: "Babel (another author)",
        author: "Someone Else",
        incomplete: false,
        members: [],
      },
    ],
    source: "combined",
  });
  const view = render(
    <BookSearch
      onAdd={() => {}}
      onAddBooks={() => {}}
      searchBooks={searchBooksMock}
    />,
  );
  fireEvent.input(view.getByLabelText("Search books"), {
    target: { value: "Babel" },
  });
  await waitFor(() =>
    expect(
      view.getByRole("button", { name: /Babel.*R. F. Kuang.*2 editions/ }),
    ).toBeTruthy(),
  );
  expect(view.container.querySelectorAll(".book-search__work")).toHaveLength(1);
  expect(view.queryByText("Babel (another author)")).toBeNull();
  expect(view.getByText("1 result found")).toBeTruthy();
  fireEvent.click(
    view.getByRole("button", { name: /Babel.*R. F. Kuang.*2 editions/ }),
  );
  expect(
    view.getByRole("dialog", { name: "Choose edition: Babel" }),
  ).toBeTruthy();
});

test("switching modes clears manual entry and old status while keeping the search term", async () => {
  searchBooksMock.mockRejectedValue(new Error("Books unavailable"));
  searchSeriesMock.mockResolvedValue({
    books: [],
    series: [],
    source: "hardcover",
  });
  const view = render(
    <BookSearch
      onAdd={() => {}}
      onAddBooks={() => {}}
      searchBooks={searchBooksMock}
      searchSeries={searchSeriesMock}
    />,
  );
  const input = view.getByLabelText("Search books") as HTMLInputElement;
  fireEvent.input(input, { target: { value: "babel" } });
  fireEvent.click(view.getByRole("button", { name: "Add manually" }));
  expect(view.getByLabelText("Book name")).toBeTruthy();
  await waitFor(() => expect(view.getByRole("alert")).toBeTruthy());
  fireEvent.click(view.getByRole("button", { name: "Series" }));
  expect(input.value).toBe("babel");
  expect(view.queryByRole("alert")).toBeNull();
  expect(view.queryByLabelText("Book name")).toBeNull();
  expect(
    view.queryByText("No books found. Try a title, author or ISBN."),
  ).toBeNull();
  await waitFor(() =>
    expect(
      view.getByText("No series found. Try a series title or author."),
    ).toBeTruthy(),
  );
  expect(input.getAttribute("aria-controls")).toBeNull();
  expect(searchBooksMock).toHaveBeenCalledTimes(1);
});

test("shows Portuguese category and series search copy", async () => {
  localStorage.setItem("hon.locale", "pt-BR");
  try {
    searchSeriesMock.mockResolvedValue({
      books: [],
      series: [],
      source: "hardcover",
    });
    const view = render(
      <LanguageProvider>
        <BookSearch
          onAdd={() => {}}
          onAddBooks={() => {}}
          searchBooks={searchBooksMock}
          searchSeries={searchSeriesMock}
        />
      </LanguageProvider>,
    );
    expect(
      view.getByRole("group", { name: "Categoria de busca" }),
    ).toBeTruthy();
    expect(
      view.getByRole("button", { name: "Livro" }).getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(view.getByRole("button", { name: "Série" }));
    expect(
      view.queryByRole("group", { name: "Filtrar por edição" }),
    ).toBeNull();
    const input = view.getByLabelText("Buscar séries") as HTMLInputElement;
    expect(input.placeholder).toBe("Título da série ou autor");
    fireEvent.input(input, { target: { value: "Babel" } });
    await waitFor(() =>
      expect(
        view.getByText(
          "Nenhuma série encontrada. Tente o título da série ou o autor.",
        ),
      ).toBeTruthy(),
    );
    expect(searchSeriesMock).toHaveBeenCalledWith("Babel", {
      signal: expect.any(AbortSignal),
    });
  } finally {
    localStorage.removeItem("hon.locale");
  }
});
