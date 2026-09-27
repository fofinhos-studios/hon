import "../../test/setup";

import { cleanup, fireEvent, render } from "@testing-library/preact";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { SearchBook } from "../../types";
import { BookSearchResults } from "./book-search-results";

afterEach(cleanup);

const book: SearchBook = {
  id: "dune",
  title: "Dune",
  author: "Frank Herbert",
  page_count: 412,
  cover_url: null,
};

describe("BookSearchResults", () => {
  test("renders results and selects a book", () => {
    const onSelect = vi.fn((_book: SearchBook) => {});
    const view = render(
      <BookSearchResults results={[book]} onSelect={onSelect} />,
    );

    fireEvent.click(view.getByRole("button", { name: /Dune/ }));

    expect(onSelect).toHaveBeenCalledWith(book);
  });

  test("shows language and publisher to distinguish editions", () => {
    const view = render(
      <BookSearchResults
        results={[
          {
            ...book,
            language: "pt",
            publisher: "Intrínseca",
            isbn: "9788551012239",
          },
        ]}
        onSelect={() => {}}
      />,
    );

    expect(view.getByText(/Português · Intrínseca/)).toBeTruthy();
    expect(view.getByText("ISBN 9788551012239")).toBeTruthy();
  });
});
