import "../../test/setup";

import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { SearchResult } from "../../services/api";
import { useBookSearch } from "./use-book-search";

const searchBooksMock = vi.fn(
  async (
    _query: string,
    _options?: { signal?: AbortSignal; edition_type?: string },
  ): Promise<SearchResult> => ({
    books: [],
    series: [],
    source: "google_books",
  }),
);

const searchSeriesMock = vi.fn(
  async (
    _query: string,
    _options?: { signal?: AbortSignal },
  ): Promise<SearchResult> => ({
    books: [],
    series: [],
    source: "hardcover",
  }),
);

afterEach(cleanup);

beforeEach(() => {
  searchBooksMock.mockReset();
  searchBooksMock.mockImplementation(async () => ({
    books: [],
    series: [],
    source: "google_books" as const,
  }));
  searchSeriesMock.mockReset();
  searchSeriesMock.mockImplementation(async () => ({
    books: [],
    series: [],
    source: "hardcover",
  }));
});

function SearchHarness() {
  const search = useBookSearch(searchBooksMock, searchSeriesMock);
  return (
    <div>
      <input
        aria-label="Query"
        value={search.query}
        onInput={(event) =>
          search.setQuery((event.target as HTMLInputElement).value)
        }
      />
      <button type="button" onClick={() => search.setMode("books")}>
        Books
      </button>
      <button type="button" onClick={() => search.setMode("series")}>
        Series
      </button>
      <button type="button" onClick={() => search.setEditionType("physical")}>
        Physical
      </button>
      <button type="button" onClick={() => search.setEditionType("digital")}>
        Digital
      </button>
      <button type="button" onClick={() => search.setEditionType(null)}>
        All
      </button>
      <button type="button" onClick={search.reset}>
        Reset
      </button>
      <span>{search.results.map((book) => book.title).join(",")}</span>
      <span>{search.series.map((item) => item.name).join(",")}</span>
      <span>{search.usingFallback ? "fallback" : "primary"}</span>
      <span>{search.error || "no error"}</span>
      <span data-testid="filter">{search.editionType ?? "all"}</span>
      <span data-testid="mode">{search.mode}</span>
      <span data-testid="partial">
        {search.partial ? "partial" : "complete"}
      </span>
      <span data-testid="searched">
        {search.searched ? "searched" : "not searched"}
      </span>
    </div>
  );
}

describe("useBookSearch", () => {
  test("does not search before three characters", async () => {
    const view = render(<SearchHarness />);

    fireEvent.input(view.getByLabelText("Query"), {
      target: { value: "lo" },
    });
    await new Promise((resolve) => setTimeout(resolve, 450));

    expect(searchBooksMock).not.toHaveBeenCalled();
  });

  test("searches after debounce and resets results", async () => {
    searchBooksMock.mockImplementation(async () => ({
      books: [
        {
          id: "dune",
          title: "Dune",
          author: "Frank Herbert",
          kind: "page",
          format: "unspecified",
          source: "open_library",
          work_key: "dune|frank herbert|und",
          page_count: 412,
          cover_url: null,
        },
      ],
      series: [],
      source: "open_library",
    }));
    const view = render(<SearchHarness />);

    fireEvent.input(view.getByLabelText("Query"), {
      target: { value: "dune" },
    });
    await waitFor(() => expect(view.getByText("Dune")).toBeTruthy(), {
      timeout: 700,
    });
    expect(view.getByText("fallback")).toBeTruthy();
    expect(searchSeriesMock).not.toHaveBeenCalled();

    fireEvent.click(view.getByRole("button", { name: "Reset" }));

    expect((view.getByLabelText("Query") as HTMLInputElement).value).toBe("");
    expect(view.queryByText("Dune")).toBeNull();
    expect(view.getByTestId("searched").textContent).toBe("not searched");
    expect(view.getByText("primary")).toBeTruthy();
  });

  test("restarts debounce on filter changes and keeps clear search unfiltered", async () => {
    const view = render(<SearchHarness />);
    fireEvent.input(view.getByLabelText("Query"), {
      target: { value: "dune" },
    });
    fireEvent.click(view.getByRole("button", { name: "Physical" }));
    fireEvent.click(view.getByRole("button", { name: "Digital" }));
    await waitFor(() => expect(searchBooksMock).toHaveBeenCalledTimes(1), {
      timeout: 700,
    });
    expect(searchBooksMock).toHaveBeenLastCalledWith("dune", {
      signal: expect.any(AbortSignal),
      edition_type: "digital",
    });
    fireEvent.click(view.getByRole("button", { name: "All" }));
    await waitFor(() => expect(searchBooksMock).toHaveBeenCalledTimes(2), {
      timeout: 700,
    });
    expect(searchBooksMock).toHaveBeenLastCalledWith("dune", {
      signal: expect.any(AbortSignal),
    });
    fireEvent.click(view.getByRole("button", { name: "Reset" }));
    expect(view.getByTestId("filter").textContent).toBe("all");
  });

  test("aborts active filter request and ignores its stale result", async () => {
    let resolveOldRequest!: (value: SearchResult) => void;
    const oldRequest = new Promise<SearchResult>((resolve) => {
      resolveOldRequest = resolve;
    });
    let oldSignal: AbortSignal | undefined;
    searchBooksMock.mockImplementation((_query, options) => {
      if (options?.edition_type === "physical") {
        oldSignal = options.signal;
        return oldRequest;
      }
      return Promise.resolve({ books: [], series: [], source: "combined" });
    });
    const view = render(<SearchHarness />);
    fireEvent.click(view.getByRole("button", { name: "Physical" }));
    fireEvent.input(view.getByLabelText("Query"), {
      target: { value: "dune" },
    });
    await waitFor(() => expect(searchBooksMock).toHaveBeenCalledTimes(1), {
      timeout: 700,
    });
    fireEvent.click(view.getByRole("button", { name: "Digital" }));
    expect(oldSignal?.aborted).toBe(true);
    resolveOldRequest({
      books: [
        {
          id: "stale",
          title: "Stale edition",
          author: "Author",
          kind: "page",
          format: "physical",
          source: "google_books",
          work_key: "stale",
          page_count: 100,
          cover_url: null,
        },
      ],
      series: [],
      source: "google_books",
    });
    expect(view.queryByText("Stale edition")).toBeNull();
    await waitFor(() => expect(searchBooksMock).toHaveBeenCalledTimes(2), {
      timeout: 700,
    });
    expect(searchBooksMock).toHaveBeenLastCalledWith("dune", {
      signal: expect.any(AbortSignal),
      edition_type: "digital",
    });
    expect(view.queryByText("Stale edition")).toBeNull();
  });

  test("ignores stale failed searches once a newer search succeeds", async () => {
    let rejectFirst: ((error: Error) => void) | undefined;
    let resolveSecond: ((value: SearchResult) => void) | undefined;
    searchBooksMock.mockImplementation((query: string) => {
      if (query === "lor") {
        return new Promise((_, reject) => {
          rejectFirst = reject;
        });
      }
      return new Promise((resolve) => {
        resolveSecond = resolve;
      });
    });
    const view = render(<SearchHarness />);
    const input = view.getByLabelText("Query");

    fireEvent.input(input, { target: { value: "lor" } });
    await new Promise((resolve) => setTimeout(resolve, 450));
    fireEvent.input(input, { target: { value: "lord" } });
    await new Promise((resolve) => setTimeout(resolve, 450));
    resolveSecond?.({
      books: [
        {
          id: "lord",
          title: "Lord Test",
          author: "Author",
          kind: "page",
          format: "unspecified",
          source: "google_books",
          work_key: "lord test|author|und",
          page_count: 123,
          cover_url: null,
        },
      ],
      series: [],
      source: "google_books",
    });
    rejectFirst?.(new Error("Search failed"));

    await waitFor(() => expect(view.getByText("Lord Test")).toBeTruthy());
    expect(view.getByText("no error")).toBeTruthy();
    expect(searchSeriesMock).not.toHaveBeenCalled();
  });

  test("shows a search error for the active request", async () => {
    searchBooksMock.mockRejectedValue(new Error("Provider unavailable"));
    const view = render(<SearchHarness />);

    fireEvent.input(view.getByLabelText("Query"), {
      target: { value: "dune" },
    });

    await waitFor(
      () => expect(view.getByText("Provider unavailable")).toBeTruthy(),
      { timeout: 700 },
    );
  });

  test("uses the fallback error message for non-Error failures", async () => {
    searchBooksMock.mockRejectedValue("Provider unavailable");
    const view = render(<SearchHarness />);

    fireEvent.input(view.getByLabelText("Query"), {
      target: { value: "dune" },
    });

    await waitFor(() => expect(view.getByText("Search failed")).toBeTruthy(), {
      timeout: 700,
    });
  });

  test("cancels pending search when unmounted", async () => {
    const view = render(<SearchHarness />);

    fireEvent.input(view.getByLabelText("Query"), {
      target: { value: "dune" },
    });
    view.unmount();
    await new Promise((resolve) => setTimeout(resolve, 450));

    expect(searchBooksMock).not.toHaveBeenCalled();
  });

  test("aborts active search when unmounted", async () => {
    let signal: AbortSignal | undefined;
    searchBooksMock.mockImplementation(
      async (_query: string, options?: { signal?: AbortSignal }) => {
        signal = options?.signal;
        return new Promise(() => {});
      },
    );
    const view = render(<SearchHarness />);

    fireEvent.input(view.getByLabelText("Query"), {
      target: { value: "dune" },
    });
    await new Promise((resolve) => setTimeout(resolve, 450));
    view.unmount();

    expect(signal?.aborted).toBe(true);
  });
  test("clears prior series on query edits and failed searches", async () => {
    searchSeriesMock
      .mockResolvedValueOnce({
        books: [],
        series: [
          {
            id: "42",
            name: "First series",
            author: "Author",
            members: [],
            incomplete: false,
          },
        ],
        source: "hardcover",
      })
      .mockRejectedValueOnce(new Error("Provider unavailable"));
    const view = render(<SearchHarness />);
    fireEvent.click(view.getByRole("button", { name: "Series" }));
    const input = view.getByLabelText("Query");
    fireEvent.input(input, { target: { value: "first" } });
    await waitFor(() => expect(view.getByText("First series")).toBeTruthy());
    fireEvent.input(input, { target: { value: "second" } });
    expect(view.queryByText("First series")).toBeNull();
    await waitFor(() =>
      expect(view.getByText("Provider unavailable")).toBeTruthy(),
    );
    expect(view.queryByText("First series")).toBeNull();
    expect(searchBooksMock).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("button", { name: "Reset" }));
    expect((view.getByLabelText("Query") as HTMLInputElement).value).toBe("");
    expect(view.getByTestId("mode").textContent).toBe("series");
    expect(view.getByTestId("searched").textContent).toBe("not searched");
    expect(view.getByText("no error")).toBeTruthy();
  });

  test("rapid mode switches dispatch only the selected endpoint and retain the book filter", async () => {
    const view = render(<SearchHarness />);
    fireEvent.click(view.getByRole("button", { name: "Physical" }));
    fireEvent.input(view.getByLabelText("Query"), {
      target: { value: "babel" },
    });
    fireEvent.click(view.getByRole("button", { name: "Series" }));
    fireEvent.click(view.getByRole("button", { name: "Books" }));
    fireEvent.click(view.getByRole("button", { name: "Series" }));

    await waitFor(() => expect(searchSeriesMock).toHaveBeenCalledTimes(1), {
      timeout: 700,
    });
    expect(searchSeriesMock).toHaveBeenCalledWith("babel", {
      signal: expect.any(AbortSignal),
    });
    expect(searchBooksMock).not.toHaveBeenCalled();
    expect(view.getByTestId("filter").textContent).toBe("physical");
    expect(view.getByTestId("mode").textContent).toBe("series");
    fireEvent.click(view.getByRole("button", { name: "Digital" }));
    expect(searchSeriesMock).toHaveBeenCalledTimes(1);
    fireEvent.click(view.getByRole("button", { name: "Books" }));
    await waitFor(() => expect(searchBooksMock).toHaveBeenCalledTimes(1), {
      timeout: 700,
    });
    expect(searchBooksMock).toHaveBeenCalledWith("babel", {
      signal: expect.any(AbortSignal),
      edition_type: "digital",
    });
    expect((view.getByLabelText("Query") as HTMLInputElement).value).toBe(
      "babel",
    );
  });

  test("ignores a late book result after switching to series", async () => {
    let resolveBook!: (value: SearchResult) => void;
    let bookSignal: AbortSignal | undefined;
    searchBooksMock.mockImplementation((_query, options) => {
      bookSignal = options?.signal;
      return new Promise<SearchResult>((resolve) => {
        resolveBook = resolve;
      });
    });
    searchSeriesMock.mockResolvedValue({
      books: [],
      series: [
        {
          id: "babel",
          name: "Babel series",
          author: "Author",
          members: [],
          incomplete: false,
        },
      ],
      source: "hardcover",
      partial: true,
    });
    const view = render(<SearchHarness />);
    fireEvent.input(view.getByLabelText("Query"), {
      target: { value: "babel" },
    });
    await waitFor(() => expect(searchBooksMock).toHaveBeenCalledTimes(1), {
      timeout: 700,
    });
    fireEvent.click(view.getByRole("button", { name: "Series" }));
    expect(bookSignal?.aborted).toBe(true);
    await waitFor(() => expect(view.getByText("Babel series")).toBeTruthy(), {
      timeout: 700,
    });
    expect(view.getByTestId("partial").textContent).toBe("partial");
    resolveBook({
      books: [
        {
          id: "old",
          title: "Old book",
          author: "Author",
          kind: "page",
          format: "physical",
          source: "google_books",
          work_key: "old|author|und",
          page_count: 100,
          cover_url: null,
        },
      ],
      series: [],
      source: "google_books",
    });
    await Promise.resolve();
    expect(view.queryByText("Old book")).toBeNull();
    expect(view.getByText("Babel series")).toBeTruthy();
    expect(view.getByTestId("mode").textContent).toBe("series");
  });

  test("a series failure and reset cannot leak results or errors across modes", async () => {
    let rejectSeries!: (reason: Error) => void;
    let seriesSignal: AbortSignal | undefined;
    searchSeriesMock.mockImplementation((_query, options) => {
      seriesSignal = options?.signal;
      return new Promise<SearchResult>((_resolve, reject) => {
        rejectSeries = reject;
      });
    });
    const view = render(<SearchHarness />);
    fireEvent.input(view.getByLabelText("Query"), {
      target: { value: "babel" },
    });
    await waitFor(() => expect(searchBooksMock).toHaveBeenCalledTimes(1), {
      timeout: 700,
    });
    fireEvent.click(view.getByRole("button", { name: "Series" }));
    await waitFor(() => expect(searchSeriesMock).toHaveBeenCalledTimes(1), {
      timeout: 700,
    });
    fireEvent.click(view.getByRole("button", { name: "Books" }));
    expect(seriesSignal?.aborted).toBe(true);
    rejectSeries(new Error("Old series failure"));
    await Promise.resolve();
    expect(view.getByText("no error")).toBeTruthy();
    expect(view.getByTestId("partial").textContent).toBe("complete");
    fireEvent.click(view.getByRole("button", { name: "Reset" }));
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(view.getByTestId("searched").textContent).toBe("not searched");
    expect(view.queryByText("Old series failure")).toBeNull();
    expect(searchBooksMock).toHaveBeenCalledTimes(1);
  });

  test("switching away from partial series results clears them before book failure", async () => {
    searchSeriesMock.mockResolvedValue({
      books: [],
      series: [
        {
          id: "series",
          name: "Series match",
          author: "Author",
          members: [],
          incomplete: false,
        },
      ],
      source: "hardcover",
      partial: true,
    });
    searchBooksMock.mockRejectedValue(new Error("Book search failed"));
    const view = render(<SearchHarness />);
    fireEvent.click(view.getByRole("button", { name: "Series" }));
    fireEvent.input(view.getByLabelText("Query"), {
      target: { value: "babel" },
    });
    await waitFor(() => expect(view.getByText("Series match")).toBeTruthy(), {
      timeout: 700,
    });
    expect(view.getByTestId("partial").textContent).toBe("partial");
    fireEvent.click(view.getByRole("button", { name: "Books" }));
    expect(view.queryByText("Series match")).toBeNull();
    expect(view.getByTestId("partial").textContent).toBe("complete");
    expect(view.getByTestId("searched").textContent).toBe("not searched");
    await waitFor(
      () => expect(view.getByText("Book search failed")).toBeTruthy(),
      { timeout: 700 },
    );
    expect(view.queryByText("Series match")).toBeNull();
    expect(searchSeriesMock).toHaveBeenCalledTimes(1);
    expect(searchBooksMock).toHaveBeenCalledTimes(1);
    fireEvent.click(view.getByRole("button", { name: "Reset" }));
    expect(view.queryByText("Book search failed")).toBeNull();
    expect(view.getByTestId("searched").textContent).toBe("not searched");
  });
});
