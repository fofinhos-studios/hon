import "../../test/setup";

import { cleanup, fireEvent, render } from "@testing-library/preact";
import { afterEach, describe, expect, test } from "vitest";
import type { Book, PageBook, SearchBook } from "../../types";
import { usePersistentBooks } from "./use-persistent-books";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const book: PageBook = {
  id: "dune",
  title: "Dune",
  author: "Frank Herbert",
  kind: "page",
  format: "unspecified",
  page_count: 412,
  cover_url: null,
};

function Harness() {
  const { books, addBook, addBooks, removeBook, reorderBooks, updateProgress } =
    usePersistentBooks();
  return (
    <>
      <button type="button" onClick={() => addBook(book)}>
        Add
      </button>
      <button
        type="button"
        onClick={() =>
          addBooks([
            book,
            { ...book, id: "messiah", title: "Dune Messiah", page_count: 256 },
            {
              ...book,
              id: "children",
              title: "Children of Dune",
              page_count: 400,
            },
            { ...book, id: "messiah", title: "Dune Messiah", page_count: 256 },
          ])
        }
      >
        Add series
      </button>
      <button type="button" onClick={() => updateProgress(book.id, 100)}>
        Progress
      </button>
      <button type="button" onClick={() => removeBook(book.id)}>
        Remove
      </button>
      <button type="button" onClick={() => reorderBooks([...books].reverse())}>
        Reorder
      </button>
      <span>
        {books[0]?.kind === "page"
          ? (books[0].pages_read ?? books.length)
          : books.length}
      </span>
      <output data-testid="books">
        {books
          .map(
            (entry) =>
              `${entry.id}:${entry.kind === "page" ? (entry.pages_read ?? 0) : 0}`,
          )
          .join(",")}
      </output>
    </>
  );
}

const physicalEdition: SearchBook = {
  id: "edition-two",
  title: "Dune: New Edition",
  author: "Frank Herbert",
  kind: "page",
  format: "physical",
  page_count: 500,
  cover_url: "https://example.com/new-cover.jpg",
  isbn: "9780000000001",
  publisher: "New Publisher",
  series: { id: "series-1", name: "Dune", position: 1 },
  source: "open_library",
  work_key: "dune|frank herbert|en",
};

function SwitchHarness({
  edition,
  targetId = book.id,
  onResult,
}: {
  edition: SearchBook;
  targetId?: string;
  onResult: (success: boolean) => void;
}) {
  const { books, addBook, switchEdition } = usePersistentBooks();
  return (
    <>
      <button type="button" onClick={() => addBook(book)}>
        Add original
      </button>
      <button
        type="button"
        onClick={() =>
          addBook({
            ...book,
            id: "open_library:edition-two",
            title: "Other book",
          })
        }
      >
        Add collision
      </button>
      <button
        type="button"
        onClick={() => onResult(switchEdition(targetId, edition))}
      >
        Switch
      </button>
      <output data-testid="saved">{JSON.stringify(books)}</output>
    </>
  );
}

describe("usePersistentBooks", () => {
  test("persists book changes", () => {
    const view = render(<Harness />);

    fireEvent.click(view.getByText("Add"));
    fireEvent.click(view.getByText("Progress"));
    view.unmount();

    const next = render(<Harness />);
    expect(next.getByText("100")).toBeTruthy();
  });

  test("does not duplicate books and can remove them", () => {
    const view = render(<Harness />);

    fireEvent.click(view.getByText("Add"));
    fireEvent.click(view.getByText("Add"));
    expect(view.getByText("1")).toBeTruthy();
    fireEvent.click(view.getByText("Reorder"));
    fireEvent.click(view.getByText("Remove"));

    expect(view.getByText("0")).toBeTruthy();
  });

  test("bulk add preserves existing progress and appends each unseen ID once", () => {
    const view = render(<Harness />);
    fireEvent.click(view.getByText("Add"));
    fireEvent.click(view.getByText("Progress"));
    fireEvent.click(view.getByText("Add series"));
    fireEvent.click(view.getByText("Add series"));
    expect(view.getByTestId("books").textContent).toBe(
      "dune:100,messiah:0,children:0",
    );
    view.unmount();

    const restored = render(<Harness />);
    expect(restored.getByTestId("books").textContent).toBe(
      "dune:100,messiah:0,children:0",
    );
  });

  test("switches to a source-prefixed edition, preserving order and progress after reload", () => {
    const first: PageBook = {
      ...book,
      pages_read: 100,
      available_editions: [physicalEdition],
      visuals: { dominant_color: "#abcdef", artwork: null },
      visuals_checked_at: 123,
      background_hidden: true,
    };
    localStorage.setItem(
      "hon.books",
      JSON.stringify([first, { ...book, id: "other", title: "Other" }]),
    );
    const results: boolean[] = [];
    const view = render(
      <SwitchHarness
        edition={physicalEdition}
        onResult={(value) => results.push(value)}
      />,
    );
    fireEvent.click(view.getByText("Switch"));
    expect(results).toEqual([true]);
    const switched = JSON.parse(
      view.getByTestId("saved").textContent ?? "",
    ) as Book[];
    expect(switched).toEqual([
      {
        id: "open_library:edition-two",
        title: "Dune: New Edition",
        author: "Frank Herbert",
        kind: "page",
        format: "physical",
        page_count: 500,
        pages_read: 100,
        cover_url: "https://example.com/new-cover.jpg",
        isbn: "9780000000001",
        publisher: "New Publisher",
        series: { id: "series-1", name: "Dune", position: 1 },
        available_editions: [physicalEdition],
        background_hidden: true,
      },
      { ...book, id: "other", title: "Other" },
    ]);
    view.unmount();
    const restored = render(
      <SwitchHarness
        edition={physicalEdition}
        onResult={(value) => results.push(value)}
      />,
    );
    expect(JSON.parse(restored.getByTestId("saved").textContent ?? "")).toEqual(
      switched,
    );
  });

  test("rejects duplicate IDs, insufficient totals and mismatched kinds without changes", () => {
    const starting: PageBook = { ...book, pages_read: 100 };
    localStorage.setItem(
      "hon.books",
      JSON.stringify([starting, { ...book, id: "open_library:edition-two" }]),
    );
    const results: boolean[] = [];
    const view = render(
      <SwitchHarness
        edition={physicalEdition}
        onResult={(value) => results.push(value)}
      />,
    );
    const before = view.getByTestId("saved").textContent;
    fireEvent.click(view.getByText("Switch"));
    expect(results).toEqual([false]);
    expect(view.getByTestId("saved").textContent).toBe(before);

    view.rerender(
      <SwitchHarness
        edition={{ ...physicalEdition, id: "short", page_count: 99 }}
        onResult={(value) => results.push(value)}
      />,
    );
    fireEvent.click(view.getByText("Switch"));
    view.rerender(
      <SwitchHarness
        edition={{
          id: "audio",
          title: "Dune Audio",
          author: "Frank Herbert",
          kind: "audiobook",
          duration_minutes: 300,
          narrators: ["Reader"],
          cover_url: null,
          source: "audiosilo",
          work_key: "dune|frank herbert|en",
        }}
        onResult={(value) => results.push(value)}
      />,
    );
    fireEvent.click(view.getByText("Switch"));
    expect(results).toEqual([false, false, false]);
    expect(view.getByTestId("saved").textContent).toBe(before);
  });

  test("retains listening progress when switching to a longer audiobook", () => {
    const original: Book = {
      id: "audiosilo:old",
      title: "Dune Audio",
      author: "Frank Herbert",
      kind: "audiobook",
      duration_minutes: 280,
      minutes_listened: 75,
      narrators: ["Old reader"],
      cover_url: null,
    };
    const edition: SearchBook = {
      id: "new",
      title: "Dune Audio",
      author: "Frank Herbert",
      kind: "audiobook",
      duration_minutes: 300,
      narrators: ["New reader"],
      cover_url: null,
      source: "audiosilo",
      work_key: "dune|frank herbert|en",
    };
    localStorage.setItem("hon.books", JSON.stringify([original]));
    const results: boolean[] = [];
    const view = render(
      <SwitchHarness
        edition={edition}
        targetId={original.id}
        onResult={(value) => results.push(value)}
      />,
    );
    fireEvent.click(view.getByText("Switch"));
    expect(results).toEqual([true]);
    expect(JSON.parse(view.getByTestId("saved").textContent ?? "")).toEqual([
      {
        ...original,
        id: "audiosilo:new",
        duration_minutes: 300,
        narrators: ["New reader"],
      },
    ]);
  });

  test("rejects an audiobook shorter than saved listening progress", () => {
    const original: Book = {
      id: "audiosilo:old",
      title: "Dune Audio",
      author: "Frank Herbert",
      kind: "audiobook",
      duration_minutes: 280,
      minutes_listened: 75,
      narrators: ["Reader"],
      cover_url: null,
    };
    const edition: SearchBook = {
      id: "short",
      title: "Dune Audio",
      author: "Frank Herbert",
      kind: "audiobook",
      duration_minutes: 74,
      narrators: ["Reader"],
      cover_url: null,
      source: "audiosilo",
      work_key: "dune|frank herbert|en",
    };
    localStorage.setItem("hon.books", JSON.stringify([original]));
    const results: boolean[] = [];
    const view = render(
      <SwitchHarness
        edition={edition}
        targetId={original.id}
        onResult={(value) => results.push(value)}
      />,
    );
    fireEvent.click(view.getByText("Switch"));
    expect(results).toEqual([false]);
    expect(JSON.parse(view.getByTestId("saved").textContent ?? "")).toEqual([
      original,
    ]);
  });
});
