import { BookCard } from "../features/books/book-card";
import { BookListEmpty } from "../features/books/book-list-empty";
import type { Book } from "../types";

interface Props {
  books: Book[];
  onRemove: (id: string) => void;
  onUpdateProgress: (id: string, pagesRead: number | undefined) => void;
  onUpdatePageCount: (id: string, pages: number) => void;
  onUpdateDuration?: (id: string, minutes: number) => void;
  onUpdateListeningProgress?: (id: string, minutes: number | undefined) => void;
}

export function BookList({
  books,
  onRemove,
  onUpdateProgress,
  onUpdatePageCount,
  onUpdateDuration,
  onUpdateListeningProgress,
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
            onUpdatePageCount={(amount) =>
              book.kind === "page"
                ? onUpdatePageCount(book.id, amount)
                : onUpdateDuration?.(book.id, amount)
            }
            onRemove={() => onRemove(book.id)}
            onUpdateProgress={(amount) =>
              book.kind === "page"
                ? onUpdateProgress(book.id, amount)
                : onUpdateListeningProgress?.(book.id, amount)
            }
          />
        ))}
      </ul>
    </div>
  );
}
