import { useEffect, useRef } from "preact/hooks";
import { useLanguage } from "../../i18n";
import type { SearchBook } from "../../types";
import { BookCover } from "./book-art";

interface Props {
  title: string;
  editions: SearchBook[];
  onSelect: (edition: SearchBook) => void;
  onClose: () => void;
  error?: string;
}

export function EditionPicker({
  title,
  editions,
  onSelect,
  onClose,
  error,
}: Props) {
  const { copy, languageName, number } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    element.showModal();
    element
      .querySelector<HTMLButtonElement>(".edition-picker__option")
      ?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog.current) return;
      const buttons = Array.from(
        dialog.current.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ),
      );
      if (buttons.length === 0) {
        event.preventDefault();
        dialog.current.focus();
        return;
      }
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialog.current.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialog.current.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      element.close();
      if (previousFocus.current?.isConnected) previousFocus.current.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      class="edition-picker"
      aria-modal="true"
      aria-labelledby="edition-picker-title"
      onCancel={(event) => {
        event.preventDefault();
        onCloseRef.current();
      }}
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX >= bounds.right ||
          event.clientY < bounds.top ||
          event.clientY >= bounds.bottom
        )
          onClose();
      }}
    >
      <div class="edition-picker__heading">
        <h2 id="edition-picker-title">
          {copy.search.chooseEdition}: {title}
        </h2>
        <button
          type="button"
          class="edition-picker__close"
          aria-label={copy.search.cancel}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <ul class="edition-picker__options">
        {editions.map((book) => (
          <li key={`${book.source}:${book.id}`}>
            <button
              type="button"
              class="edition-picker__option book-search__result"
              onClick={() => onSelect(book)}
            >
              <BookCover book={book} />
              <span class="book-search__result-info">
                <span class="book-search__result-title">
                  {book.kind === "audiobook"
                    ? copy.books.audiobook
                    : book.format === "physical"
                      ? copy.books.physical
                      : book.format === "digital"
                        ? copy.books.digital
                        : copy.books.unspecified}
                </span>
                {book.language && (
                  <span class="book-search__result-meta">
                    {languageName(book.language)}
                  </span>
                )}
                <span class="book-search__result-meta">
                  {book.kind === "audiobook"
                    ? book.duration_minutes
                      ? copy.books.durationCount(number(book.duration_minutes))
                      : copy.search.durationNotListed
                    : book.page_count
                      ? copy.books.pageCount(number(book.page_count))
                      : copy.search.pagesNotListed}
                  {book.publisher ? ` · ${book.publisher}` : ""}
                  {book.published_date ? ` · ${book.published_date}` : ""}
                </span>
                {book.kind === "audiobook" && book.narrators.length > 0 && (
                  <span class="book-search__result-meta">
                    {copy.books.narrators(book.narrators.join(", "))}
                  </span>
                )}
                {book.isbn && (
                  <span class="book-search__result-meta hon-mono">
                    ISBN {book.isbn}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
