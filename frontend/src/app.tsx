import { BookList } from "./components/book-list";
import { BookSearch } from "./components/book-search";
import { Icon } from "./components/icon";
import { PlannerControls } from "./components/reading-planner";
import { useBookVisuals } from "./features/books/use-book-visuals";
import { usePersistentBooks } from "./features/books/use-persistent-books";
import { ScheduleSection } from "./features/planner/schedule-section";
import { useReadingPlanner } from "./features/planner/use-reading-planner";
import { LanguageProvider, useLanguage } from "./i18n";

export function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}

function AppContent() {
  const { locale, copy, setLocale } = useLanguage();
  const library = usePersistentBooks();
  const planner = useReadingPlanner(library.books);
  useBookVisuals(library.books, library.updateVisuals);
  return (
    <div class="hon-shell" id="top">
      <a class="skip-link" href="#library">
        {copy.skip}
      </a>
      <header class="hon-header">
        <a class="hon-brand-lockup" href="#top" aria-label={copy.home}>
          <span class="hon-mark" aria-hidden="true">
            本
          </span>
          <h1 class="hon-brand">hon</h1>
          <span class="hon-brand-subtitle">{copy.subtitle}</span>
        </a>
        <nav aria-label={copy.navigation}>
          <a href="#library">
            {copy.yourBooks} <Icon name="arrowDown" size={16} />
          </a>
          <a href="#schedule">
            {copy.schedule} <Icon name="arrowDown" size={16} />
          </a>
        </nav>
        <label class="hon-language">
          <span class="sr-only">{copy.language}</span>
          <select
            aria-label={copy.language}
            value={locale}
            onChange={(event) =>
              setLocale(event.currentTarget.value as "en" | "pt-BR")
            }
          >
            <option value="pt-BR">Português (Brasileiro)</option>
            <option value="en">English</option>
          </select>
        </label>
      </header>
      <main>
        <section class="hon-settings" aria-label={copy.plan}>
          <PlannerControls planner={planner} bookCount={library.books.length} />
        </section>
        <div class="hon-dashboard">
          <section
            class="hon-library"
            id="library"
            aria-labelledby="library-heading"
          >
            <div class="hon-section-heading">
              <h2 id="library-heading">
                <Icon name="books" size={24} />
                {copy.yourBooks}
              </h2>
            </div>
            <BookSearch onAdd={library.addBook} />
            <BookList
              books={library.books}
              onRemove={library.removeBook}
              onUpdateProgress={library.updateProgress}
              onUpdatePageCount={library.updatePageCount}
            />
          </section>
          <aside
            class="hon-schedule"
            id="schedule"
            aria-label={copy.readingSchedule}
          >
            <ScheduleSection
              books={library.books}
              bookCount={library.books.length}
              noDaysWarning={planner.noDaysWarning}
              pagesPerDay={planner.pagesPerDay}
              method={planner.method}
              schedule={planner.schedule}
              onReorder={library.reorderBooks}
            />
          </aside>
        </div>
      </main>
      <footer class="hon-footer">
        <span>
          {copy.madeWithLove}{" "}
          <a href="https://fofinhos.studio/">fofinhos.studio</a>
        </span>
        <a
          class="hon-footer__github"
          href="https://github.com/fofinhos-studios/hon"
          aria-label="View hon on GitHub"
        >
          <Icon name="github" size={20} />
        </a>
      </footer>
    </div>
  );
}
