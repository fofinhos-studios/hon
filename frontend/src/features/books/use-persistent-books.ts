import { useCallback, useEffect, useState } from "preact/hooks";
import type { Book, BookVisuals } from "../../types";
import { loadBooks, saveBooks } from "./book-storage";

export function usePersistentBooks() {
  const [books, setBooks] = useState<Book[]>(() => loadBooks(localStorage));

  useEffect(() => saveBooks(localStorage, books), [books]);

  const updateVisuals = useCallback((id: string, visuals: BookVisuals) => {
    setBooks((current) =>
      current.map((book) =>
        book.id === id
          ? { ...book, visuals, visuals_checked_at: Date.now() }
          : book,
      ),
    );
  }, []);

  return {
    books,
    updateVisuals,
    updatePageCount: (id: string, pages: number) => {
      if (!Number.isSafeInteger(pages) || pages < 1) return;
      setBooks((current) =>
        current.map((book) =>
          book.id === id && pages >= (book.pages_read ?? 0)
            ? { ...book, page_count: pages }
            : book,
        ),
      );
    },
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
