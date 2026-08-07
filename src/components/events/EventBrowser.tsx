"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import type { EventCategory, NewsEvent } from "@/types/events";
import { CategoryFilterBar, type CategoryFilter } from "./CategoryFilterBar";
import { EventCard } from "./EventCard";
import { SearchBar } from "./SearchBar";

type SortMode = "newest" | "biggest";

const VALID_CATEGORIES: ReadonlyArray<CategoryFilter> = [
  "ALL",
  "TARIFF",
  "INFLATION",
  "FED",
  "GEOPOLITICAL",
  "EARNINGS",
];

const isValidCategory = (v: string | null): v is CategoryFilter =>
  v !== null && (VALID_CATEGORIES as readonly string[]).includes(v);

const isValidSort = (v: string | null): v is SortMode =>
  v === "newest" || v === "biggest";

const PAGE_SIZE = 12;

interface EventsApiResponse {
  events: NewsEvent[];
  total: number;
  offset: number;
  limit: number;
  counts: Record<EventCategory | "ALL", number>;
}

const ZERO_COUNTS: Record<CategoryFilter, number> = {
  ALL: 0,
  TARIFF: 0,
  INFLATION: 0,
  FED: 0,
  GEOPOLITICAL: 0,
  EARNINGS: 0,
};

export function EventBrowser() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlCat = searchParams.get("cat");
  const urlSort = searchParams.get("sort");
  const urlQuery = searchParams.get("q") ?? "";

  const category: CategoryFilter = isValidCategory(urlCat) ? urlCat : "ALL";
  const sortMode: SortMode = isValidSort(urlSort) ? urlSort : "newest";

  const [searchInput, setSearchInput] = useState(urlQuery);

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  useEffect(() => {
    if (searchInput === urlQuery) return;
    const t = setTimeout(() => updateParam("q", searchInput), 200);
    return () => clearTimeout(t);
  }, [searchInput, urlQuery, updateParam]);

  useEffect(() => {
    setSearchInput(urlQuery);
  }, [urlQuery]);

  const handleCategoryChange = useCallback(
    (cat: CategoryFilter) => updateParam("cat", cat === "ALL" ? null : cat),
    [updateParam],
  );

  const handleSortChange = useCallback(
    (sort: SortMode) =>
      updateParam("sort", sort === "newest" ? null : sort),
    [updateParam],
  );

  const [events, setEvents] = useState<NewsEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] =
    useState<Record<CategoryFilter, number>>(ZERO_COUNTS);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(
    async (offset: number, signal: AbortSignal): Promise<EventsApiResponse> => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(PAGE_SIZE),
        type: category,
        sort: sortMode,
      });
      if (urlQuery.trim().length > 0) params.set("q", urlQuery.trim());

      const res = await fetch(`/api/events?${params.toString()}`, { signal });
      if (!res.ok) {
        throw new Error(`Failed to load events (${res.status})`);
      }
      return (await res.json()) as EventsApiResponse;
    },
    [category, sortMode, urlQuery],
  );

  // Reset + fetch first page whenever filter/sort/q changes.
  useEffect(() => {
    const ac = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setInitialLoad(true);
    setError(null);

    fetchEvents(0, ac.signal)
      .then((data) => {
        setEvents(data.events);
        setTotal(data.total);
        setCounts({
          ALL: data.counts.ALL,
          TARIFF: data.counts.TARIFF,
          INFLATION: data.counts.INFLATION,
          FED: data.counts.FED,
          GEOPOLITICAL: data.counts.GEOPOLITICAL,
          EARNINGS: data.counts.EARNINGS,
        });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Failed to load events",
        );
      })
      .finally(() => {
        setLoading(false);
        setInitialLoad(false);
      });

    return () => ac.abort();
  }, [fetchEvents]);

  const loadMore = useCallback(async () => {
    if (loading) return;
    if (events.length >= total) return;
    const ac = new AbortController();
    setLoading(true);
    try {
      const data = await fetchEvents(events.length, ac.signal);
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        const next = data.events.filter((e) => !seen.has(e.id));
        return [...prev, ...next];
      });
      setTotal(data.total);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, [fetchEvents, events.length, total, loading]);

  // Sticky header behavior
  const [stickyVisible, setStickyVisible] = useState(false);
  const stickyAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const anchor = stickyAnchorRef.current;
    if (!anchor) return;
    const handler = () => {
      setStickyVisible(anchor.getBoundingClientRect().top < 64);
    };
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Infinite scroll sentinel
  const loadSentinelRef = useRef<HTMLDivElement | null>(null);
  const hasMore = events.length < total;

  useEffect(() => {
    const sentinel = loadSentinelRef.current;
    if (!sentinel) return;
    if (!hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const counterDisplay = useMemo(
    () => ({
      visible: events.length,
      total,
    }),
    [events.length, total],
  );

  return (
    <>
      <AnimatePresence>
        {stickyVisible && (
          <motion.div
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-x-0 top-16 z-10 border-b border-white/5 bg-[#080C10]/90 backdrop-blur"
          >
            <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-3 lg:flex-row lg:items-center lg:gap-4">
              <div className="lg:w-80 lg:shrink-0">
                <SearchBar
                  value={searchInput}
                  onChange={setSearchInput}
                  resultCount={events.length}
                />
              </div>
              <div className="lg:flex-1 lg:min-w-0">
                <CategoryFilterBar
                  active={category}
                  onChange={handleCategoryChange}
                  counts={counts}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-6 flex flex-col gap-4">
        <SearchBar
          value={searchInput}
          onChange={setSearchInput}
          resultCount={events.length}
        />
        <CategoryFilterBar
          active={category}
          onChange={handleCategoryChange}
          counts={counts}
        />
      </div>

      <div ref={stickyAnchorRef} className="h-px" />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="flex items-baseline gap-2 font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
          <span className="tabular-nums">
            {counterDisplay.visible} of {counterDisplay.total}
          </span>
          <span className="text-[10px] tracking-normal text-zinc-600 normal-case">
            ({events.length} loaded)
          </span>
        </h2>
        <div className="flex items-center gap-1 rounded-md border border-white/5 p-1">
          <SortButton
            active={sortMode === "newest"}
            onClick={() => handleSortChange("newest")}
          >
            Newest
          </SortButton>
          <SortButton
            active={sortMode === "biggest"}
            onClick={() => handleSortChange("biggest")}
          >
            Biggest Move
          </SortButton>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/5 px-6 py-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {!initialLoad && events.length === 0 ? (
        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-6 py-16 text-center">
          <p className="text-zinc-300">No events match your search</p>
          <p className="mt-2 text-sm text-zinc-500">
            Try clearing your filters or searching for something else.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {events.map((event) => (
              <motion.div
                key={event.id}
                layout
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                <Link
                  href={`/events/${event.id}`}
                  className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF94]/40"
                >
                  <EventCard event={event} />
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <div ref={loadSentinelRef} className="h-px" aria-hidden />

      {loading && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}
    </>
  );
}

function Spinner() {
  return (
    <span
      role="status"
      aria-label="Loading more events"
      className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#00FF94]/20 border-t-[#00FF94]"
    />
  );
}

function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-3 py-1 text-xs font-semibold transition ${
        active
          ? "bg-white/10 text-zinc-100"
          : "text-zinc-500 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}