import { useState } from "preact/hooks";
import { BookCard } from "../features/books/book-card";
import { BookSearchStatus } from "../features/books/book-search-status";
import type { Book, DayOfWeek } from "../types";
import { DayPicker } from "./day-picker";
import { Icon, type IconName } from "./icon";
import { Tooltip } from "./tooltip";

const sample: Book = {
  id: "gallery",
  title: "The Shape of a Reading Day",
  author: "Hon design system",
  page_count: 320,
  pages_read: 96,
  cover_url: null,
};
export function DesignSystemGallery() {
  const [days, setDays] = useState<DayOfWeek[]>([0, 1, 2, 3, 4]);
  const [book, setBook] = useState(sample);
  return (
    <main class="ds-gallery">
      <p class="hon-eyebrow">Hon / visual reference</p>
      <h1>Design system</h1>
      <p>Edit tokens and shared rules in design-system.css.</p>
      <a href="/">Back to the planner</a>
      <section>
        <h2>Type & scale</h2>
        <h1>One page at a time.</h1>
        <h3>Clash Grotesk / Book title</h3>
        <p>Switzer / Interface text. 0123456789 · ÁÉÍÓÚ ç ã</p>
        <p class="hon-eyebrow">Labels / 12px / Medium</p>
      </section>
      <section>
        <h2>Surfaces & book colors</h2>
        <div class="ds-swatches">
          {[
            "white",
            "concrete",
            "book-fallback-1",
            "book-fallback-2",
            "book-fallback-3",
            "book-fallback-4",
          ].map((token) => (
            <div
              key={token}
              class="ds-swatch"
              style={{ background: `var(--${token})` }}
            >
              {token}
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2>Controls & states</h2>
        <div class="ds-row">
          <button type="button" class="hon-btn hon-btn--accent">
            <Icon name="plus" />
            Add book
          </button>
          <button type="button" class="hon-btn">
            Secondary
          </button>
          <button type="button" class="hon-btn" disabled>
            Disabled
          </button>
          <button type="button" class="hon-btn" aria-busy="true">
            <Icon name="spinner" class="hon-spin" />
            Loading…
          </button>
          <Tooltip content="Tooltips work with a pointer and keyboard focus." />
        </div>
        <div class="ds-row">
          <label>
            Default
            <input class="hon-input" placeholder="Book name" />
          </label>
          <label>
            Invalid
            <input class="hon-input" aria-invalid="true" defaultValue="0" />
          </label>
          <label>
            Disabled
            <input class="hon-input" disabled value="Unavailable" />
          </label>
        </div>
        <p class="reading-planner__warn" role="alert">
          Select at least one reading day.
        </p>
        <DayPicker selected={days} onChange={setDays} />
        <BookSearchStatus loading error="" resultCount={0} />
      </section>
      <section>
        <h2>Phosphor / outline</h2>
        <div class="ds-row">
          {(
            [
              "books",
              "route",
              "calendar",
              "bookOpen",
              "arrowUpRight",
              "eyeSlash",
              "search",
              "grip",
            ] as IconName[]
          ).map((name) => (
            <span key={name}>
              <Icon name={name} size={32} /> {name}
            </span>
          ))}
        </div>
      </section>
      <section>
        <h2>Book plate</h2>
        <ul class="book-list__items">
          <BookCard
            book={book}
            onUpdatePageCount={(page_count) => setBook({ ...book, page_count })}
            onRemove={() => setBook(sample)}
            onUpdateProgress={(pages_read) => setBook({ ...book, pages_read })}
          />
        </ul>
      </section>
    </main>
  );
}
