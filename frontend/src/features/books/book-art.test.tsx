import { fireEvent, render } from "@testing-library/preact";
import { expect, test } from "vitest";
import type { Book } from "../../types";
import { ArtCredit, BookBackdrop, BookCover } from "./book-art";
import { bookVisualStyle, safeImageUrl } from "./book-visuals";

const book: Book = {
  id: "a",
  title: "Book",
  author: "Author",
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
