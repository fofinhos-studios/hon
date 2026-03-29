import { BookOpen, X } from "lucide-preact";
import type { Book } from "../types";

interface Props {
  books: Book[];
  onRemove: (id: string) => void;
}

export function BookList({ books, onRemove }: Props) {
  if (books.length === 0) {
    return (
      <div class="book-list-empty">
        <BookOpen class="book-list-empty__icon" size={32} aria-hidden="true" />
        <p class="book-list-empty__text">
          Search for a book above to add it to your list.
        </p>
      </div>
    );
  }

  const totalPages = books.reduce((sum, b) => sum + b.page_count, 0);

  return (
    <div class="book-list">
      <ul class="book-list__items">
        {books.map((book) => (
          <li key={book.id} class="book-list__item">
            {book.cover_url && (
              <img
                class="book-list__cover"
                src={book.cover_url}
                alt=""
                width={28}
                height={42}
              />
            )}
            <div class="book-list__info">
              <span class="book-list__title">{book.title}</span>
              <span class="book-list__meta hon-mono">
                {book.author} · {book.page_count}pp
              </span>
            </div>
            <button
              type="button"
              class="book-list__remove"
              aria-label={`Remove ${book.title}`}
              onClick={() => onRemove(book.id)}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <p class="book-list__total hon-mono">
        {books.length} book{books.length === 1 ? "" : "s"} · {totalPages.toLocaleString()} pages total
      </p>
    </div>
  );
}
