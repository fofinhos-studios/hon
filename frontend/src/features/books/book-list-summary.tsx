import type { Book } from "../../types";
import { totalBookPages, totalRemainingBookPages } from "./book-progress";

interface Props {
  books: Book[];
}

export function BookListSummary({ books }: Props) {
  return (
    <p class="book-list__total hon-mono">
      {books.length} book{books.length === 1 ? "" : "s"} ·{" "}
      {totalRemainingBookPages(books).toLocaleString()} /{" "}
      {totalBookPages(books).toLocaleString()} pages left
    </p>
  );
}
