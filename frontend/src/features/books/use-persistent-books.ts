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

  const addBooks = useCallback((incoming: Book[]) => {
    setBooks((current) => {
      const seen = new Set(current.map((book) => book.id));
      const additions = incoming.filter((book) => {
        if (seen.has(book.id)) return false;
        seen.add(book.id);
        return true;
      });
      return additions.length ? [...current, ...additions] : current;
    });
  }, []);

  return {
    books,
    updateVisuals,
    addBooks,
    updatePageCount: (id: string, pages: number) => {
      if (!Number.isSafeInteger(pages) || pages < 1) return;
      setBooks((current) =>
        current.map((book) =>
          book.id === id &&
          book.kind === "page" &&
          pages >= (book.pages_read ?? 0)
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
          book.id === id && book.kind === "page"
            ? { ...book, pages_read: pagesRead }
            : book,
        ),
      ),
    updateDuration: (id: string, minutes: number) => {
      if (!Number.isSafeInteger(minutes) || minutes < 1) return;
      setBooks((current) =>
        current.map((book) =>
          book.id === id &&
          book.kind === "audiobook" &&
          minutes >= (book.minutes_listened ?? 0)
            ? { ...book, duration_minutes: minutes }
            : book,
        ),
      );
    },
    updateListeningProgress: (id: string, minutes: number | undefined) =>
      setBooks((current) =>
        current.map((book) =>
          book.id === id && book.kind === "audiobook"
            ? { ...book, minutes_listened: minutes }
            : book,
        ),
      ),
  };
}
