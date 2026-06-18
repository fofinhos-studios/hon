interface Props {
  loading: boolean;
  error: string;
  resultCount: number;
}

export function BookSearchStatus({ loading, error, resultCount }: Props) {
  return (
    <>
      {loading && (
        <p class="book-search__status hon-mono" aria-live="polite">
          <span class="book-search__status-indicator" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          Searching catalog…
        </p>
      )}
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
