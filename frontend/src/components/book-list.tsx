import { useLayoutEffect, useRef } from "preact/hooks";
import { BookCard } from "../features/books/book-card";
import { BookListEmpty } from "../features/books/book-list-empty";
import type { Book, SearchBook } from "../types";

interface Props {
  books: Book[];
  onRemove: (id: string) => void;
  onUpdateProgress: (id: string, pagesRead: number | undefined) => void;
  onUpdatePageCount: (id: string, pages: number) => void;
  onUpdateDuration?: (id: string, minutes: number) => void;
  onUpdateListeningProgress?: (id: string, minutes: number | undefined) => void;
  onSwitchEdition: (id: string, edition: SearchBook) => boolean;
}

export function BookList({
  books,
  onRemove,
  onUpdateProgress,
  onUpdatePageCount,
  onUpdateDuration,
  onUpdateListeningProgress,
  onSwitchEdition,
}: Props) {
  const list = useRef<HTMLUListElement>(null);
  const pendingSwitch = useRef<string | null>(null);

  useLayoutEffect(() => {
    const targetId = pendingSwitch.current;
    if (!targetId) return;
    const index = books.findIndex((book) => book.id === targetId);
    if (index < 0) return;
    pendingSwitch.current = null;
    list.current?.children
      .item(index)
      ?.querySelector<HTMLButtonElement>(".book-plate__switch-edition")
      ?.focus();
  }, [books]);

  if (books.length === 0) return <BookListEmpty />;

  return (
    <div class="book-list">
      <ul class="book-list__items" ref={list}>
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
            onSwitchEdition={(edition) => {
              const nextId = edition.id.startsWith(`${edition.source}:`)
                ? edition.id
                : `${edition.source}:${edition.id}`;
              if (nextId !== book.id) pendingSwitch.current = nextId;
              const switched = onSwitchEdition(book.id, edition);
              if (!switched) pendingSwitch.current = null;
              return switched;
            }}
          />
        ))}
      </ul>
    </div>
  );
}
