import "../../test/setup";

import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import type { Book } from "../../types";
import { BookSearchResults } from "./book-search-results";

afterEach(cleanup);

const book: Book = {
  id: "dune",
  title: "Dune",
  author: "Frank Herbert",
  page_count: 412,
  cover_url: null,
};

describe("BookSearchResults", () => {
  test("renders results and selects a book", () => {
    const onSelect = mock((_book: Book) => {});
    const view = render(
      <BookSearchResults
        results={[book]}
        usingFallback={false}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: /Dune/ }));

    expect(onSelect).toHaveBeenCalledWith(book);
  });

  test("renders fallback source note", () => {
    const view = render(
      <BookSearchResults
        results={[book]}
        usingFallback={true}
        onSelect={() => {}}
      />,
    );

    expect(view.getByText("Results via OpenLibrary")).toBeTruthy();
  });
});
