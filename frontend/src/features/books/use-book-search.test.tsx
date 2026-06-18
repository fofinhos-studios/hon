import "../../test/setup";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import type { SearchResult } from "../../services/api";

const searchBooksMock = mock(
  async (
    _query: string,
    _options?: { signal?: AbortSignal },
  ): Promise<SearchResult> => ({
    books: [],
    source: "google_books",
  }),
);

mock.module("../../services/api", () => ({
  searchBooks: searchBooksMock,
}));

const { useBookSearch } = await import("./use-book-search");

afterEach(cleanup);

beforeEach(() => {
  searchBooksMock.mockReset();
  searchBooksMock.mockImplementation(async () => ({
    books: [],
    source: "google_books" as const,
  }));
});

function SearchHarness() {
  const search = useBookSearch();
  return (
    <div>
      <input
        aria-label="Query"
        value={search.query}
        onInput={(event) =>
          search.setQuery((event.target as HTMLInputElement).value)
        }
      />
      <button type="button" onClick={search.reset}>
        Reset
      </button>
      <span>{search.results.map((book) => book.title).join(",")}</span>
      <span>{search.usingFallback ? "fallback" : "primary"}</span>
      <span>{search.error || "no error"}</span>
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
          page_count: 412,
          cover_url: null,
        },
      ],
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

    fireEvent.click(view.getByRole("button", { name: "Reset" }));

    expect((view.getByLabelText("Query") as HTMLInputElement).value).toBe("");
    expect(view.queryByText("Dune")).toBeNull();
    expect(view.getByText("primary")).toBeTruthy();
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
          page_count: 123,
          cover_url: null,
        },
      ],
      source: "google_books",
    });
    rejectFirst?.(new Error("Search failed"));

    await waitFor(() => expect(view.getByText("Lord Test")).toBeTruthy());
    expect(view.getByText("no error")).toBeTruthy();
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
});
