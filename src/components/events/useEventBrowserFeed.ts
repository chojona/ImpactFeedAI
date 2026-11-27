"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_LIMIT,
  ZERO_CATEGORY_COUNTS,
  feedQueryKey,
  type SortMode,
} from "@/services/events/queryParams";
import type { CategoryFilter } from "./CategoryFilterBar";
import type {
  ApiErrorBody,
  EventsApiResponse,
  FeedInitialData,
  FeedResultState,
} from "./EventBrowserTypes";
import { useFeedUrlSync } from "./useFeedUrlSync";
import { useSyncRef } from "./useSyncRef";

export function useEventBrowserFeed(initial: FeedInitialData, pathname: string) {
  const [category, setCategory] = useState<CategoryFilter>(initial.category);
  const [sortMode, setSortMode] = useState<SortMode>(initial.sort);
  const [searchInput, setSearchInput] = useState(initial.search);
  const [search, setSearch] = useState(initial.search);
  const [result, setResult] = useState<FeedResultState>({
    events: initial.events,
    total: initial.total,
    rankedCount: initial.rankedCount,
    libraryTotal: initial.libraryTotal,
    counts: initial.counts,
  });
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(false);
  const [error, setError] = useState<string | null>(initial.error);
  const libraryTotalRef = useRef(initial.libraryTotal);
  useSyncRef(libraryTotalRef, result.libraryTotal);
  useFeedUrlSync({
    pathname,
    category,
    sortMode,
    search,
    searchInput,
    setCategory,
    setSortMode,
    setSearchInput,
    setSearch,
  });
  const queryKey = feedQueryKey({ category, sort: sortMode, search });

  const fetchEvents = useCallback(
    async (offset: number, signal: AbortSignal): Promise<EventsApiResponse> => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(DEFAULT_LIMIT),
        type: category,
        sort: sortMode,
      });
      if (search.length > 0) params.set("q", search);
      const res = await fetch(`/api/events?${params}`, { signal });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
        throw new Error(body?.message ?? `Failed to load events (${res.status})`);
      }
      return (await res.json()) as EventsApiResponse;
    },
    [category, sortMode, search],
  );

  const loadedKeyRef = useRef(initial.key);
  useEffect(() => {
    if (queryKey === loadedKeyRef.current) return;
    loadedKeyRef.current = queryKey;
    const ac = new AbortController();
    setLoading(true);
    setInitialLoad(true);
    setError(null);
    fetchEvents(0, ac.signal)
      .then((data) => {
        setResult({
          events: data.events,
          total: data.total,
          rankedCount: data.rankedCount,
          libraryTotal: data.libraryTotal,
          counts: { ...ZERO_CATEGORY_COUNTS, ...data.counts },
        });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResult({
          events: [],
          total: 0,
          rankedCount: 0,
          libraryTotal: libraryTotalRef.current,
          counts: { ...ZERO_CATEGORY_COUNTS },
        });
        setError(err instanceof Error ? err.message : "Failed to load events");
      })
      .finally(() => {
        setLoading(false);
        setInitialLoad(false);
      });
    return () => ac.abort();
  }, [queryKey, fetchEvents]);

  const loadMore = useCallback(async () => {
    if (loading || result.events.length >= result.total) return;
    setLoading(true);
    try {
      const data = await fetchEvents(
        result.events.length,
        new AbortController().signal,
      );
      setResult((prev) => {
        const seen = new Set(prev.events.map((e) => e.id));
        const next = data.events.filter((e) => !seen.has(e.id));
        return {
          events: [...prev.events, ...next],
          total: data.total,
          rankedCount: data.rankedCount,
          libraryTotal: data.libraryTotal,
          counts: prev.counts,
        };
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, [fetchEvents, result.events.length, result.total, loading]);

  return {
    category,
    setCategory,
    sortMode,
    setSortMode,
    searchInput,
    setSearchInput,
    result,
    loading,
    initialLoad,
    error,
    loadMore,
  };
}
