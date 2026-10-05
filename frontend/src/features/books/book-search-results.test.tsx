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
  kind: "page",
  format: "unspecified",
  source: "google_books",
  work_key: "dune|frank herbert|und",
  page_count: 412,
  cover_url: null,
};

describe("BookSearchResults", () => {
  test("renders results and selects a book", () => {
    const onSelect = vi.fn((_book: SearchBook) => {});
    const view = render(
      <BookSearchResults results={[book]} onSelect={onSelect} />,
    );

    fireEvent.click(view.getByRole("button", { name: /Edition.*412 pages/ }));

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

    expect(view.getByText("Portuguese")).toBeTruthy();
    expect(view.getByText(/Intrínseca/)).toBeTruthy();
    expect(view.getByText("ISBN 9788551012239")).toBeTruthy();
  });

  test("nests selectable formats under a work and separates languages", () => {
    const audio: SearchBook = {
      ...book,
      id: "recording",
      kind: "audiobook",
      source: "audiosilo",
      duration_minutes: 300,
      narrators: ["Reader"],
    };
    const digital: SearchBook = {
      ...book,
      id: "ebook",
      format: "digital",
      page_count: 550,
    };
    const portuguese: SearchBook = {
      ...book,
      id: "translation",
      language: "pt",
      work_key: "dune|frank herbert|pt",
    };
    const onSelect = vi.fn();
    const view = render(
      <BookSearchResults
        results={[book, audio, digital, portuguese]}
        onSelect={onSelect}
      />,
    );
    expect(view.container.querySelectorAll(".book-search__work")).toHaveLength(
      2,
    );
    expect(
      view.container.querySelectorAll(
        ".book-search__work:first-child .book-search__result-item",
      ),
    ).toHaveLength(3);
    fireEvent.click(view.getByRole("button", { name: /Audiobook.*300/ }));
    expect(onSelect).toHaveBeenCalledWith(audio);
  });
});
