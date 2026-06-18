import "../test/setup";

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/preact";
import type { Book } from "../types";
import { BookList } from "./book-list";

afterEach(cleanup);

const books: Book[] = [
  {
    id: "a",
    title: "First Book",
    author: "Author A",
    page_count: 100,
    cover_url: null,
  },
  {
    id: "b",
    title: "Second Book",
    author: "Author B",
    page_count: 200,
    cover_url: null,
  },
];

describe("BookList", () => {
  test("renders empty state and summary", () => {
    const empty = render(
      <BookList
        books={[]}
        onRemove={() => {}}
        onReorder={() => {}}
        onUpdateProgress={() => {}}
      />,
    );
    expect(
      empty.getByText("Search or enter a book above to add it to your list."),
    ).toBeTruthy();
    empty.unmount();

    const populated = render(
      <BookList
        books={books}
        onRemove={() => {}}
        onReorder={() => {}}
        onUpdateProgress={() => {}}
      />,
    );
    expect(populated.getByText("2 books · 300 / 300 pages left")).toBeTruthy();
  });
});
