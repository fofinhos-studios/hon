import { useEffect, useState } from "preact/hooks";
import { Icon } from "../../components/icon";

interface Props {
  loading: boolean;
  error: string;
  resultCount: number;
}

function SearchLoading() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  // These messages describe elapsed waiting, not unreported provider progress.
  const message =
    elapsed >= 10
      ? "Taking longer than usual…"
      : elapsed >= 5
        ? "Still searching catalogs…"
        : "Searching catalogs…";
  return (
    <div class="book-search__loading">
      <Icon name="spinner" class="hon-spin" size={24} />
      <output aria-live="polite" aria-atomic="true">
        {message}
      </output>
      <span class="book-search__elapsed hon-mono" aria-hidden="true">
        {elapsed}s elapsed
      </span>
    </div>
  );
}

export function BookSearchStatus({ loading, error, resultCount }: Props) {
  return (
    <>
      {loading && <SearchLoading />}
      {error && (
        <p class="book-search__error" role="alert">
          {error}
        </p>
      )}
      <p class="sr-only" aria-live="polite" aria-atomic="true">
        {!loading && resultCount > 0
          ? `${resultCount} result${resultCount === 1 ? "" : "s"} found`
          : ""}
      </p>
    </>
  );
}
