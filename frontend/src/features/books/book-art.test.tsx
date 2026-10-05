import { cleanup, fireEvent, render } from "@testing-library/preact";
import { afterEach, expect, test } from "vitest";
import type { PageBook } from "../../types";
import {
  ArtCredit,
  BookBackdrop,
  BookCover,
  clearImageFailureCache,
} from "./book-art";
import { bookVisualStyle, safeImageUrl } from "./book-visuals";

const book: PageBook = {
  id: "a",
  title: "Book",
  author: "Author",
  kind: "page",
  format: "unspecified",
  page_count: 100,
  cover_url: "https://covers.openlibrary.org/cover.jpg",
  visuals: {
    dominant_color: "#112233",
    artwork: {
      image_url: "https://upload.wikimedia.org/art.jpg",
      source_url: "https://commons.wikimedia.org/wiki/File:Art",
      author: "Artist",
      license: "CC BY-SA 4.0",
    },
  },
};

afterEach(() => {
  cleanup();
  clearImageFailureCache();
});

test("failed art falls back to the cover and then to the graphic surface", () => {
  const view = render(<BookBackdrop book={book} />);
  const art = view.container.querySelector("img");
  if (!art) throw new Error("Expected artwork");
  expect(art.src).toContain("art.jpg");
  fireEvent.error(art);
  expect(view.container.querySelector("img")?.src).toContain("cover.jpg");
  fireEvent.error(art);
  expect(view.container.querySelector("img")).toBeNull();
});

test("failed cover has a readable placeholder; hidden background has no image", () => {
  const cover = render(<BookCover book={book} />);
  fireEvent.error(cover.getByRole("img"));
  expect(cover.getByLabelText("No cover for Book")).toBeTruthy();
  cover.unmount();
  const hidden = render(
    <BookBackdrop book={{ ...book, background_hidden: true }} />,
  );
  expect(hidden.container.querySelector("img")).toBeNull();
});

test("art has accessible attribution and rejects unsafe URLs", () => {
  const view = render(<ArtCredit book={book} />);
  fireEvent.click(view.getByText("Image credit"));
  expect(
    view.getByText("Artist · CC BY-SA 4.0").getAttribute("href"),
  ).toContain("commons.wikimedia.org");
  expect(safeImageUrl("javascript:alert(1)")).toBeUndefined();
  expect(bookVisualStyle(book)).toEqual(
    bookVisualStyle({ ...book, pages_read: 50 }),
  );
  expect(
    bookVisualStyle({ ...book, visuals: undefined })["--book-fallback"],
  ).toMatch(/var\(--book-fallback-[1-4]\)/);
});

test("cover failure tries the same ISBN fallback before showing a placeholder", () => {
  const view = render(
    <BookCover
      book={{
        ...book,
        cover_fallback_url: "https://covers.openlibrary.org/isbn.jpg",
      }}
    />,
  );
  const img = view.getByAltText("Cover of Book");
  fireEvent.error(img);
  expect(img.getAttribute("src")).toContain("isbn.jpg");
  fireEvent.error(img);
  expect(view.getByLabelText("No cover for Book")).toBeTruthy();
  view.unmount();
});

test("recovers a saved ISBN edition from its publisher after catalog images fail", () => {
  const view = render(
    <BookCover
      book={{
        ...book,
        id: "isbn:9786559240630",
        cover_fallback_url: "https://covers.openlibrary.org/missing.jpg",
      }}
    />,
  );
  fireEvent.error(view.getByAltText("Cover of Book"));
  fireEvent.error(view.getByAltText("Cover of Book"));
  expect(view.getByAltText("Cover of Book").getAttribute("src")).toBe(
    "/api/books/cover?isbn=9786559240630",
  );
  fireEvent.error(view.getByAltText("Cover of Book"));
  expect(view.getByLabelText("No cover for Book")).toBeTruthy();
  view.unmount();
});

test("a book with no catalog cover can load its exact ISBN cover", () => {
  const view = render(
    <BookCover book={{ ...book, isbn: "9786559240630", cover_url: null }} />,
  );
  expect(view.getByAltText("Cover of Book").getAttribute("src")).toBe(
    "/api/books/cover?isbn=9786559240630",
  );
  view.unmount();
});

test("visible images load eagerly while later images remain lazy", () => {
  const first = render(
    <>
      <BookCover book={book} priority="high" />
      <BookBackdrop book={book} priority="high" />
    </>,
  );
  for (const image of first.container.querySelectorAll("img")) {
    expect(image.getAttribute("loading")).toBe("eager");
    expect(image.getAttribute("fetchpriority")).toBe("high");
    expect(image.getAttribute("decoding")).toBe("sync");
  }
  first.unmount();

  const later = render(
    <>
      <BookCover book={book} />
      <BookBackdrop book={book} />
    </>,
  );
  for (const image of later.container.querySelectorAll("img")) {
    expect(image.getAttribute("loading")).toBe("lazy");
    expect(image.getAttribute("decoding")).toBe("async");
  }
  later.unmount();
});

test("a failed URL is skipped by other cards during this session", () => {
  const sameEdition = {
    ...book,
    cover_url: "https://covers.openlibrary.org/session-missing.jpg",
    cover_fallback_url: "https://covers.openlibrary.org/session-fallback.jpg",
    visuals: undefined,
  };
  const cover = render(<BookCover book={sameEdition} />);
  fireEvent.error(cover.getByAltText("Cover of Book"));
  cover.unmount();

  const backdrop = render(<BookBackdrop book={sameEdition} />);
  expect(backdrop.container.querySelector("img")?.getAttribute("src")).toBe(
    "https://covers.openlibrary.org/session-fallback.jpg",
  );
  backdrop.unmount();
});
