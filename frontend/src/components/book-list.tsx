import { BookCard } from "../features/books/book-card";
import { BookListEmpty } from "../features/books/book-list-empty";
import type { Book } from "../types";

interface Props {
  books: Book[];
  onRemove: (id: string) => void;
  onUpdateProgress: (id: string, pagesRead: number | undefined) => void;
  onUpdatePageCount: (id: string, pages: number) => void;
}

export function BookList({
  books,
  onRemove,
  onUpdateProgress,
  onUpdatePageCount,
}: Props) {
  if (books.length === 0) return <BookListEmpty />;

  return (
    <div class="book-list">
      <ul class="book-list__items">
        {books.map((book, index) => (
          <BookCard
            key={book.id}
            book={book}
            index={index}
            onUpdatePageCount={(pages) => onUpdatePageCount(book.id, pages)}
            onRemove={() => onRemove(book.id)}
            onUpdateProgress={(pagesRead) =>
              onUpdateProgress(book.id, pagesRead)
            }
          />
        ))}
      </ul>
    </div>
  );
}
