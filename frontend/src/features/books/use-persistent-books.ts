import { useCallback, useEffect, useState } from "preact/hooks";
import type { Book, BookVisuals, SearchBook } from "../../types";
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

  const switchEdition = useCallback(
    (id: string, edition: SearchBook): boolean => {
      const original = books.find((book) => book.id === id);
      if (
        !original ||
        original.kind !== edition.kind ||
        !edition.source ||
        !edition.id
      )
        return false;
      const nextId = edition.id.startsWith(`${edition.source}:`)
        ? edition.id
        : `${edition.source}:${edition.id}`;
      const total =
        edition.kind === "page" ? edition.page_count : edition.duration_minutes;
      const progress =
        original.kind === "page"
          ? (original.pages_read ?? 0)
          : (original.minutes_listened ?? 0);
      if (
        total === null ||
        !Number.isSafeInteger(total) ||
        total < 1 ||
        total < progress ||
        (nextId !== id && books.some((book) => book.id === nextId))
      )
        return false;
      if (nextId === id) return true;
      const common = {
        id: nextId,
        title: edition.title,
        author: edition.author,
        cover_url: edition.cover_url,
        cover_fallback_url: edition.cover_fallback_url,
        isbn: edition.isbn,
        language: edition.language,
        publisher: edition.publisher,
        published_date: edition.published_date,
        available_editions: original.available_editions,
        background_hidden: original.background_hidden,
      };
      const next: Book =
        edition.kind === "page"
          ? {
              ...common,
              kind: "page",
              format: edition.format,
              page_count: total,
              series: edition.series,
              pages_read:
                original.kind === "page" ? original.pages_read : undefined,
            }
          : {
              ...common,
              kind: "audiobook",
              duration_minutes: total,
              narrators: edition.narrators,
              minutes_listened:
                original.kind === "audiobook"
                  ? original.minutes_listened
                  : undefined,
            };
      setBooks((current) =>
        current.map((book) => (book.id === id ? next : book)),
      );
      return true;
    },
    [books],
  );

  return {
    books,
    updateVisuals,
    addBooks,
    switchEdition,
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
    clearBooks: () => setBooks([]),
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
