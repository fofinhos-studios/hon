import { BookCard } from "../features/books/book-card";
import { BookListEmpty } from "../features/books/book-list-empty";
import { BookListSummary } from "../features/books/book-list-summary";
import { useBookReorder } from "../hooks/use-book-reorder";
import type { Book } from "../types";

interface Props {
  books: Book[];
  onRemove: (id: string) => void;
  onReorder: (books: Book[]) => void;
  onUpdateProgress: (id: string, pagesRead: number | undefined) => void;
}

export function BookList({
  books,
  onRemove,
  onReorder,
  onUpdateProgress,
}: Props) {
  const { dragState, getItemStyle, handlePointerDown, setItemRef } =
    useBookReorder(books, onReorder);

  if (books.length === 0) return <BookListEmpty />;

  return (
    <div class="book-list">
      <ul class="book-list__items">
        {books.map((book, index) => (
          <BookCard
            key={book.id}
            book={book}
            isDragging={dragState?.bookId === book.id && dragState.activated}
            isDropTarget={
              dragState?.targetIndex === index &&
              dragState.targetIndex !== dragState.originIndex
            }
            style={getItemStyle(index, book.id)}
            onPointerDown={(event) => handlePointerDown(book.id, event)}
            onRemove={() => onRemove(book.id)}
            onUpdateProgress={(pagesRead) =>
              onUpdateProgress(book.id, pagesRead)
            }
            itemRef={(element) => setItemRef(book.id, element)}
          />
        ))}
      </ul>
      <BookListSummary books={books} />
    </div>
  );
}
