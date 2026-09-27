import { Icon } from "../../components/icon";

export function BookListEmpty() {
  return (
    <div class="book-list-empty">
      <Icon
        name="bookOpen"
        class="book-list-empty__icon"
        size={32}
        aria-hidden="true"
      />
      <p class="book-list-empty__text">Your library is empty.</p>
    </div>
  );
}
