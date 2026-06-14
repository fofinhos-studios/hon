import { Library } from "lucide-preact";
import { useState } from "preact/hooks";
import { BookList } from "../components/book-list";
import { BookSearch } from "../components/book-search";
import { ReadingPlanner } from "../components/reading-planner";
import type { Book } from "../types";

export function HomePage() {
  const [books, setBooks] = useState<Book[]>([]);

  const addBook = (book: Book) => {
    if (books.some((b) => b.id === book.id)) return;
    setBooks((prev) => [...prev, book]);
  };

  const removeBook = (id: string) => {
    setBooks((prev) => prev.filter((b) => b.id !== id));
  };

  const reorderBooks = (nextBooks: Book[]) => {
    setBooks(nextBooks);
  };

  const updateProgress = (id: string, pagesRead: number | undefined) => {
    setBooks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, pages_read: pagesRead } : b)),
    );
  };

  return (
    <div class="hon-shell">
      <header class="hon-header">
        <span class="hon-mark" data-char="本" aria-hidden="true">
          本
        </span>
        <div class="hon-brand-lockup">
          <span class="hon-brand">hon</span>
          <span class="hon-brand-subtitle">reading planner</span>
        </div>
      </header>

      <div class="hon-dashboard">
        <aside class="hon-panel">
          <p class="hon-section-title">
            <Library size={14} aria-hidden="true" />
            <span>Your books</span>
          </p>
          <BookSearch onAdd={addBook} />
          <div class="hon-panel__list-wrap">
            <BookList
              books={books}
              onRemove={removeBook}
              onReorder={reorderBooks}
              onUpdateProgress={updateProgress}
            />
          </div>
        </aside>

        <main class="hon-panel hon-panel--right">
          <ReadingPlanner books={books} />
        </main>
      </div>
    </div>
  );
}
