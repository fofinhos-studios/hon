import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { SearchApiError, searchBooks, searchSeries } from "../../services/api";
import type { EditionType } from "../../services/api";
import type { SearchBook, SearchSeries } from "../../types";

const SEARCH_DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 3;
export type SearchErrorCode = "invalid" | "timeout" | "unavailable" | "unknown";
export type SearchMode = "books" | "series";

export function useBookSearch(
  search = searchBooks,
  searchForSeries = searchSeries,
) {
  const [query, setQueryState] = useState("");
  const [mode, setModeState] = useState<SearchMode>("books");
  const [editionType, setEditionTypeState] = useState<EditionType | null>(null);
  const queryRef = useRef("");
  const modeRef = useRef<SearchMode>("books");
  const editionTypeRef = useRef<EditionType | null>(null);
  const [results, setResults] = useState<SearchBook[]>([]);
  const [series, setSeries] = useState<SearchSeries[]>([]);
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
    queryRef.current = "";
    setQueryState("");
    setResults([]);
    setSeries([]);
    setLoading(false);
    setSearched(false);
    setPartial(false);
    setError("");
    setErrorCode("unknown");
    setUsingFallback(false);
  }, [cancelCurrentSearch]);

  const runSearch = useCallback(
    (
      value: string,
      selectedEditionType: EditionType | null,
      selectedMode: SearchMode,
      delay = SEARCH_DEBOUNCE_MS,
    ) => {
      cancelCurrentSearch();
      const trimmed = value.trim();
      const requestId = requestIdRef.current;
      setResults([]);
      setSeries([]);
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
          const response =
            selectedMode === "books"
              ? await search(trimmed, {
                  signal: controller.signal,
                  ...(selectedEditionType
                    ? { edition_type: selectedEditionType }
                    : {}),
                })
              : await searchForSeries(trimmed, { signal: controller.signal });
          if (requestId !== requestIdRef.current) return;
          const {
            books,
            series: matches,
            source,
            partial: incomplete,
          } = response;
          setResults(selectedMode === "books" ? books : []);
          setSeries(selectedMode === "series" ? (matches ?? []) : []);
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
          setSeries([]);
        } finally {
          if (controllerRef.current === controller)
            controllerRef.current = null;
          if (requestId === requestIdRef.current) setLoading(false);
        }
      }, delay);
    },
    [cancelCurrentSearch, search, searchForSeries],
  );

  const setQuery = (value: string) => {
    queryRef.current = value;
    setQueryState(value);
    runSearch(value, editionTypeRef.current, modeRef.current);
  };
  const setEditionType = (value: EditionType | null) => {
    if (editionTypeRef.current === value) return;
    editionTypeRef.current = value;
    setEditionTypeState(value);
    if (modeRef.current === "books")
      runSearch(queryRef.current, value, "books", 0);
  };
  const setMode = (value: SearchMode) => {
    if (modeRef.current === value) return;
    modeRef.current = value;
    setModeState(value);
    runSearch(queryRef.current, editionTypeRef.current, value, 0);
  };
  return {
    mode,
    query,
    editionType,
    results,
    series,
    loading,
    searched,
    partial,
    error,
    errorCode,
    usingFallback,
    setQuery,
    setEditionType,
    setMode,
    reset,
  };
}
