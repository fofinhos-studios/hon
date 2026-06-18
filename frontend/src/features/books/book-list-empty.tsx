import { BookOpen } from "lucide-preact";

export function BookListEmpty() {
  return (
    <div class="book-list-empty">
      <BookOpen class="book-list-empty__icon" size={32} aria-hidden="true" />
      <p class="book-list-empty__text">
        Search or enter a book above to add it to your list.
      </p>
    </div>
  );
}
