import { useEffect, useRef } from "preact/hooks";
import { fetchBookVisuals } from "../../services/api";
import type { Book, BookVisuals } from "../../types";

// Per mounted library: two requests, no retries on a failed service this session.
// Cancellation is tied to membership, not progress edits or list order.
export function useBookVisuals(
  books: Book[],
  onVisuals: (id: string, visuals: BookVisuals) => void,
  fetchVisuals = fetchBookVisuals,
) {
  const latest = useRef({ books, onVisuals });
  latest.current = { books, onVisuals };
  const running = useRef(new Map<string, AbortController>());
  const attempted = useRef(new Set<string>());
  const mounted = useRef(false);
  const pump = useRef(() => {});
  pump.current = () => {
    if (!mounted.current) return;
    for (const book of latest.current.books) {
      if (running.current.size >= 2) break;
      if (
        (book.visuals &&
          (!book.visuals_checked_at ||
            Date.now() - book.visuals_checked_at <
              (book.visuals.artwork && book.visuals.dominant_color
                ? 86400000
                : 3600000))) ||
        attempted.current.has(book.id) ||
        running.current.has(book.id)
      )
        continue;
      attempted.current.add(book.id);
      const controller = new AbortController();
      running.current.set(book.id, controller);
      fetchVisuals(book, controller.signal)
        .then((visuals) => {
          if (
            mounted.current &&
            !controller.signal.aborted &&
            latest.current.books.some((current) => current.id === book.id)
          )
            latest.current.onVisuals(book.id, visuals);
        })
        .catch(() => {
          /* Decoration must never interrupt reading. */
        })
        .finally(() => {
          if (running.current.get(book.id) === controller)
            running.current.delete(book.id);
          pump.current();
        });
    }
  };

  useEffect(() => {
    mounted.current = true;
    pump.current();
    return () => {
      mounted.current = false;
      for (const controller of running.current.values()) controller.abort();
      running.current.clear();
    };
  }, []);

  useEffect(() => {
    const ids = new Set(books.map((book) => book.id));
    for (const [id, controller] of running.current) {
      if (!ids.has(id)) controller.abort();
    }
    for (const id of attempted.current)
      if (!ids.has(id)) attempted.current.delete(id);
    pump.current();
  }, [books]);
}
