import "../../test/setup";

import { cleanup, fireEvent, render } from "@testing-library/preact";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { SearchBook, SearchSeries } from "../../types";
import { BookSearchResults, SeriesSearchResults } from "./book-search-results";

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
    const onSelect = vi.fn();
    const view = render(
      <BookSearchResults results={[book]} onSelect={onSelect} />,
    );

    expect(view.container.querySelectorAll(".book-search__work")).toHaveLength(
      1,
    );
    expect(view.getByText("1 edition")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: /Dune.*1 edition/i }));

    expect(onSelect).toHaveBeenCalledWith(book, [book]);
    expect(view.queryByRole("dialog")).toBeNull();
  });

  test("groups an unknown-language edition with the sole known-language work", () => {
    const english: SearchBook = {
      ...book,
      id: "english",
      language: "en",
      work_key: "dune|frank herbert|en",
    };
    const onSelect = vi.fn();
    const view = render(
      <BookSearchResults results={[book, english]} onSelect={onSelect} />,
    );
    expect(view.container.querySelectorAll(".book-search__work")).toHaveLength(
      1,
    );
    expect(view.queryByText("English")).toBeNull();
    fireEvent.click(view.getByRole("button", { name: /Dune.*2 editions/i }));
    const options = view
      .getByRole("dialog")
      .querySelectorAll<HTMLButtonElement>(".edition-picker__option");
    expect(options).toHaveLength(2);
    expect(options[0].textContent).not.toContain("English");
    expect(options[1].textContent).toContain("English");
    fireEvent.click(options[0]);
    expect(onSelect).toHaveBeenCalledWith(book, [book, english]);
  });

  test("shows Babel translations together without combining other authors or titles", () => {
    const english: SearchBook = {
      ...book,
      id: "babel-en",
      title: "Babel",
      author: "R. F. Kuang",
      language: "en",
      format: "physical",
      work_key: "babel|r f kuang|en",
      cover_url: "https://example.com/babel-en.jpg",
    };
    const digital: SearchBook = {
      ...english,
      id: "babel-ebook",
      format: "digital",
      work_key: "",
    };
    const portuguese: SearchBook = {
      ...english,
      id: "babel-pt",
      title: "Bábel",
      author: "R.F. Kuang",
      language: "pt",
      publisher: "Intrínseca",
      work_key: "babel|r f kuang|pt",
      cover_url: null,
    };
    const audio: SearchBook = {
      ...english,
      id: "babel-audio",
      kind: "audiobook",
      source: "audiosilo",
      duration_minutes: 300,
      narrators: ["Reader"],
      work_key: "legacy-key",
    };
    const anotherAuthor: SearchBook = {
      ...english,
      id: "other-babel",
      author: "Other Author",
      work_key: english.work_key,
    };
    const anotherTitle: SearchBook = {
      ...english,
      id: "yellowface",
      title: "Yellowface",
      work_key: english.work_key,
    };
    const onSelect = vi.fn();
    const view = render(
      <BookSearchResults
        results={[
          english,
          anotherAuthor,
          digital,
          anotherTitle,
          portuguese,
          audio,
        ]}
        onSelect={onSelect}
      />,
    );
    const cards = view.container.querySelectorAll(".book-search__work");
    expect(cards).toHaveLength(3);
    expect(
      [...cards].map(
        (card) => card.querySelector(".book-search__result-title")?.textContent,
      ),
    ).toEqual(["Babel", "Babel", "Yellowface"]);
    expect(cards[0].textContent).toContain("R. F. Kuang");
    expect(cards[0].textContent).toContain("4 editions");
    expect(cards[0].textContent).not.toContain("English");
    expect(cards[0].textContent).not.toContain("Portuguese");
    expect(cards[0].querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/babel-en.jpg",
    );
    fireEvent.click(
      view.getByRole("button", { name: /Babel.*R\. F\. Kuang.*4 editions/ }),
    );
    const options = view
      .getByRole("dialog", { name: /choose edition.*babel/i })
      .querySelectorAll<HTMLButtonElement>(".edition-picker__option");
    expect(options).toHaveLength(4);
    expect([...options].map((option) => option.textContent)).toEqual([
      expect.stringContaining("Physical"),
      expect.stringContaining("Digital"),
      expect.stringContaining("Portuguese"),
      expect.stringContaining("Audiobook"),
    ]);
    expect(options[0].textContent).toContain("English");
    expect(options[1].textContent).toContain("English");
    expect(options[2].textContent).toContain("Portuguese");
    expect(options[2].textContent).toContain("Intrínseca");
    fireEvent.click(options[2]);
    expect(onSelect).toHaveBeenCalledWith(portuguese, [
      english,
      digital,
      portuguese,
      audio,
    ]);
    expect(view.queryByRole("dialog")).toBeNull();
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
    expect(view.getByText(/ISBN 9788551012239/)).toBeTruthy();
  });

  test("shows one artwork-bearing card per work and opens an edition picker", () => {
    const english: SearchBook = {
      ...book,
      language: "en",
      work_key: "dune|frank herbert|en",
    };
    const audio: SearchBook = {
      ...english,
      id: "recording",
      kind: "audiobook",
      source: "audiosilo",
      duration_minutes: 300,
      narrators: ["Reader"],
      cover_url: "https://example.com/recording.jpg",
    };
    const digital: SearchBook = {
      ...english,
      id: "ebook",
      format: "digital",
      page_count: 550,
      publisher: "Ace",
      isbn: "9780441172719",
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
        results={[english, audio, digital, portuguese]}
        onSelect={onSelect}
      />,
    );
    expect(view.container.querySelectorAll(".book-search__work")).toHaveLength(
      1,
    );
    expect(
      view.container.querySelectorAll(".book-search__result"),
    ).toHaveLength(1);
    expect(view.getByText("4 editions")).toBeTruthy();
    expect(
      view.container
        .querySelector(".book-search__work img")
        ?.getAttribute("src"),
    ).toBe("https://example.com/recording.jpg");
    fireEvent.click(view.getByRole("button", { name: /Dune.*4 editions/i }));
    const dialog = view.getByRole("dialog", { name: /choose edition.*dune/i });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.querySelectorAll(".edition-picker__option")).toHaveLength(4);
    expect(document.activeElement).toBe(
      dialog.querySelector(".edition-picker__option"),
    );
    expect(view.getByText(/Ace/)).toBeTruthy();
    fireEvent.click(
      view.getByRole("button", { name: /Audiobook.*300 minutes/i }),
    );
    expect(onSelect).toHaveBeenCalledWith(audio, [
      english,
      audio,
      digital,
      portuguese,
    ]);
    expect(view.queryByRole("dialog")).toBeNull();
  });

  test("keeps the edition picker and focus when the first translation changes", () => {
    const english: SearchBook = {
      ...book,
      id: "babel-en",
      title: "Babel",
      author: "R. F. Kuang",
      language: "en",
      work_key: "babel|r f kuang|en",
    };
    const portuguese: SearchBook = {
      ...english,
      id: "babel-pt",
      author: "R.F. Kuang",
      language: "pt",
      work_key: "babel|r f kuang|pt",
    };
    const view = render(
      <BookSearchResults results={[english, portuguese]} onSelect={() => {}} />,
    );
    const trigger = view.getByRole("button", { name: /Babel.*2 editions/i });
    trigger.focus();
    fireEvent.click(trigger);
    view.rerender(
      <BookSearchResults results={[portuguese, english]} onSelect={() => {}} />,
    );
    const dialog = view.getByRole("dialog");
    expect(dialog.querySelectorAll(".edition-picker__option")).toHaveLength(2);
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(view.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  test("traps keyboard focus and restores the trigger on Escape and overlay click", () => {
    const second = { ...book, id: "second", format: "digital" as const };
    const view = render(
      <BookSearchResults results={[book, second]} onSelect={() => {}} />,
    );
    const trigger = view.getByRole("button", { name: /Dune.*2 editions/i });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = view.getByRole("dialog");
    const options = dialog.querySelectorAll<HTMLButtonElement>(
      ".edition-picker__option",
    );
    const close = dialog.querySelector<HTMLButtonElement>(
      ".edition-picker__close",
    );
    if (!close) throw new Error("Edition picker close button is missing");
    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(options[options.length - 1]);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    // Browsers dispatch cancel when Escape is pressed on a modal dialog.
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(view.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    const overlay = view.getByRole("dialog");
    vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue({
      left: 10,
      top: 10,
      right: 110,
      bottom: 110,
    } as DOMRect);
    fireEvent.mouseDown(overlay, { clientX: 20, clientY: 20 });
    expect(view.getByRole("dialog")).toBe(overlay);
    fireEvent.mouseDown(overlay, { clientX: 0, clientY: 0 });
    expect(view.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  test("renders a series summary row without nesting any member books", () => {
    const first = {
      ...book,
      id: "first",
      series: { id: "series", name: "Dune Saga", position: 1 },
    };
    const second = {
      ...book,
      id: "second",
      title: "Dune Messiah",
      work_key: "dune messiah|frank herbert|und",
      series: { id: "series", name: "Dune Saga", position: 2 },
    };
    const series: SearchSeries = {
      id: "series",
      name: "Dune Saga",
      author: "Frank Herbert",
      incomplete: false,
      members: [first, second],
    };
    const onAddSeries = vi.fn();
    const view = render(
      <>
        <SeriesSearchResults
          series={[series]}
          query="Dune Saga"
          onAddSeries={onAddSeries}
        />
        <BookSearchResults results={[first, second]} onSelect={() => {}} />
      </>,
    );
    expect(
      view.container.querySelectorAll(".book-search__series"),
    ).toHaveLength(1);
    expect(
      view.container.querySelector(".book-search__series .book-search__result"),
    ).toBeNull();
    expect(view.container.querySelectorAll(".book-search__work")).toHaveLength(
      2,
    );
    expect(view.getByText("2 books found · 2 main · 0 optional")).toBeTruthy();
    fireEvent.click(
      view.getByRole("button", { name: "Add series: Dune Saga" }),
    );
    expect(onAddSeries.mock.calls[0][0]).toEqual([first, second]);
  });
});
