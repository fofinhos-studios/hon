import { useEffect, useState } from "preact/hooks";
import { Icon } from "../../components/icon";
import { useLanguage } from "../../i18n";
import type { SearchErrorCode } from "./use-book-search";

interface Props {
  loading: boolean;
  error: string;
  errorCode?: SearchErrorCode;
  resultCount: number;
}

function SearchLoading() {
  const { copy } = useLanguage();
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
      ? copy.search.takingLonger
      : elapsed >= 5
        ? copy.search.stillSearching
        : copy.search.searching;
  return (
    <div class="book-search__loading">
      <Icon name="spinner" class="hon-spin" size={24} />
      <output aria-live="polite" aria-atomic="true">
        {message}
      </output>
      <span class="book-search__elapsed hon-mono" aria-hidden="true">
        {copy.search.elapsed(elapsed)}
      </span>
    </div>
  );
}

export function BookSearchStatus({
  loading,
  error,
  errorCode = "unknown",
  resultCount,
}: Props) {
  const { copy } = useLanguage();
  return (
    <>
      {loading && <SearchLoading />}
      {error && (
        <p class="book-search__error" role="alert">
          {copy.search.errors[errorCode]}
        </p>
      )}
      <p class="sr-only" aria-live="polite" aria-atomic="true">
        {!loading && resultCount > 0
          ? copy.search.resultsFound(resultCount)
          : ""}
      </p>
    </>
  );
}
