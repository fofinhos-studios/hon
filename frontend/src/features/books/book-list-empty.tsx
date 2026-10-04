import { Icon } from "../../components/icon";
import { useLanguage } from "../../i18n";

export function BookListEmpty() {
  const { copy } = useLanguage();
  return (
    <div class="book-list-empty">
      <Icon
        name="bookOpen"
        class="book-list-empty__icon"
        size={32}
        aria-hidden="true"
      />
      <p class="book-list-empty__text">{copy.books.empty}</p>
    </div>
  );
}
