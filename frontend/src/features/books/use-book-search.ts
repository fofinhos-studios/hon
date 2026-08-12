import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { searchBooks } from "../../services/api";
import type { Book } from "../../types";

const SEARCH_DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 3;

export function useBookSearch(search = searchBooks) {
  const [query, setQueryState] = useState("");
  const [results, setResults] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [usingFallback, setUsingFallback] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const cancelCurrentSearch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
    controllerRef.current?.abort();
    controllerRef.current = null;
    requestIdRef.current += 1;
  }, []);

  useEffect(() => cancelCurrentSearch, [cancelCurrentSearch]);

  const reset = useCallback(() => {
    cancelCurrentSearch();
    setQueryState("");
    setResults([]);
    setLoading(false);
    setError("");
    setUsingFallback(false);
  }, [cancelCurrentSearch]);

  const setQuery = useCallback(
    (value: string) => {
      cancelCurrentSearch();
      const trimmed = value.trim();
      const requestId = requestIdRef.current;

      setQueryState(value);
      setError("");
      setUsingFallback(false);

      if (trimmed.length < MIN_QUERY_LENGTH) {
        setResults([]);
        setLoading(false);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        debounceRef.current = null;
        const controller = new AbortController();
        controllerRef.current = controller;
        setLoading(true);
        try {
          const { books, source } = await search(trimmed, {
            signal: controller.signal,
          });
          if (requestId !== requestIdRef.current) return;
          setResults(books);
          setUsingFallback(source === "open_library");
        } catch (searchError) {
          if (requestId !== requestIdRef.current) return;
          setError(
            searchError instanceof Error
              ? searchError.message
              : "Search failed",
          );
          setResults([]);
        } finally {
          if (controllerRef.current === controller)
            controllerRef.current = null;
          if (requestId === requestIdRef.current) setLoading(false);
        }
      }, SEARCH_DEBOUNCE_MS);
    },
    [cancelCurrentSearch, search],
  );

  return {
    query,
    results,
    loading,
    error,
    usingFallback,
    setQuery,
    reset,
  };
}
