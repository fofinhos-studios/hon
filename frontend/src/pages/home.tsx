import { Library } from "lucide-preact";
import { BookList } from "../components/book-list";
import { BookSearch } from "../components/book-search";
import { ReadingPlanner } from "../components/reading-planner";
import { Tooltip } from "../components/tooltip";
import { usePersistentBooks } from "../features/books/use-persistent-books";

export function HomePage() {
  const { books, addBook, removeBook, reorderBooks, updateProgress } =
    usePersistentBooks();

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
            <Tooltip content="Search for books, add them to your shelf, drag to reorder them, and track your current progress (pages or percentage)." />
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
