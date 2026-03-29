import "../test/setup";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/preact";

const searchBooksMock = mock(async (_query: string) => []);

mock.module("../services/api", () => ({
  searchBooks: searchBooksMock,
}));

const { BookSearch } = await import("./book-search");

afterEach(() => {
  searchBooksMock.mockReset();
});

beforeEach(() => {
  searchBooksMock.mockImplementation(async (_query: string) => []);
});

describe("BookSearch", () => {
  test("does not search before three characters", async () => {
    const view = render(<BookSearch onAdd={() => {}} />);
    const input = view.getByLabelText("Search books") as HTMLInputElement;

    fireEvent.input(input, { target: { value: "lo" } });

    await new Promise((resolve) => setTimeout(resolve, 450));

    expect(searchBooksMock).not.toHaveBeenCalled();
  });

  test("ignores stale failed searches once a newer search succeeds", async () => {
    let rejectFirst: ((error: Error) => void) | undefined;
    let resolveSecond:
      | ((
          value: Array<{
            id: string;
            title: string;
            author: string;
            page_count: number;
            cover_url: null;
          }>,
        ) => void)
      | undefined;

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

    const view = render(<BookSearch onAdd={() => {}} />);
    const input = view.getByLabelText("Search books") as HTMLInputElement;

    fireEvent.input(input, { target: { value: "lor" } });
    await new Promise((resolve) => setTimeout(resolve, 450));

    fireEvent.input(input, { target: { value: "lord" } });
    await new Promise((resolve) => setTimeout(resolve, 450));

    resolveSecond?.([
      {
        id: "OL1W",
        title: "Lord Test",
        author: "Author",
        page_count: 123,
        cover_url: null,
      },
    ]);
    rejectFirst?.(new Error("Search failed"));

    await waitFor(() => {
      expect(view.getByText("Lord Test")).toBeTruthy();
    });

    expect(view.queryByRole("alert")).toBeNull();
  });
});
