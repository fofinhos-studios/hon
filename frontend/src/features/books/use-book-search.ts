import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { SearchApiError, searchBooks } from "../../services/api";
import type { SearchBook } from "../../types";

const SEARCH_DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 3;
export type SearchErrorCode = "invalid" | "timeout" | "unavailable" | "unknown";

export function useBookSearch(search = searchBooks) {
  const [query, setQueryState] = useState("");
  const [results, setResults] = useState<SearchBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [partial, setPartial] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState<SearchErrorCode>("unknown");
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
    setSearched(false);
    setPartial(false);
    setError("");
    setErrorCode("unknown");
    setUsingFallback(false);
  }, [cancelCurrentSearch]);

  const runSearch = useCallback(
    (value: string) => {
      cancelCurrentSearch();
      const trimmed = value.trim();
      const requestId = requestIdRef.current;
      setResults([]);
      setSearched(false);
      setPartial(false);
      setError("");
      setErrorCode("unknown");
      setUsingFallback(false);
      if (trimmed.length < MIN_QUERY_LENGTH) {
        setLoading(false);
        return;
      }
      setLoading(true);
      debounceRef.current = setTimeout(async () => {
        debounceRef.current = null;
        const controller = new AbortController();
        controllerRef.current = controller;
        try {
          const {
            books,
            source,
            partial: incomplete,
          } = await search(trimmed, {
            signal: controller.signal,
          });
          if (requestId !== requestIdRef.current) return;
          setResults(books);
          setPartial(!!incomplete);
          setSearched(true);
          setUsingFallback(source === "open_library");
        } catch (searchError) {
          if (requestId !== requestIdRef.current) return;
          setError(
            searchError instanceof Error
              ? searchError.message
              : "Search failed",
          );
          setErrorCode(
            searchError instanceof SearchApiError
              ? searchError.code
              : "unknown",
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

  const setQuery = (value: string) => {
    setQueryState(value);
    runSearch(value);
  };
  return {
    query,
    results,
    loading,
    searched,
    partial,
    error,
    errorCode,
    usingFallback,
    setQuery,
    reset,
  };
}
