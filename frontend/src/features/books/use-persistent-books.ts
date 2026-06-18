import { useEffect, useState } from "preact/hooks";
import type { Book } from "../../types";
import { loadBooks, saveBooks } from "./book-storage";

export function usePersistentBooks() {
  const [books, setBooks] = useState<Book[]>(() => loadBooks(localStorage));

  useEffect(() => saveBooks(localStorage, books), [books]);

  return {
    books,
    addBook: (book: Book) =>
      setBooks((current) =>
        current.some((candidate) => candidate.id === book.id)
          ? current
          : [...current, book],
      ),
    removeBook: (id: string) =>
      setBooks((current) => current.filter((book) => book.id !== id)),
    reorderBooks: setBooks,
    updateProgress: (id: string, pagesRead: number | undefined) =>
      setBooks((current) =>
        current.map((book) =>
          book.id === id ? { ...book, pages_read: pagesRead } : book,
        ),
      ),
  };
}
