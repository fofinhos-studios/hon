import { BookOpen } from "lucide-preact";
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

  return (
    <div class="hon-shell">
      <header class="hon-header">
        <BookOpen size={18} class="hon-header__icon" aria-hidden="true" />
        <span class="hon-brand">hon</span>
      </header>

      <div class="hon-dashboard">
        <aside class="hon-panel">
          <p class="hon-section-title">Your books</p>
          <BookSearch onAdd={addBook} />
          <div class="hon-panel__list-wrap">
            <BookList books={books} onRemove={removeBook} />
          </div>
        </aside>

        <main class="hon-panel hon-panel--right">
          <p class="hon-section-title">Reading plan</p>
          <ReadingPlanner books={books} />
        </main>
      </div>
    </div>
  );
}
