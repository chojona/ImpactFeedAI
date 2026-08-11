"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import { FILTERABLE_CATEGORIES } from "@/lib/eventCategories";
import type { NewsEvent } from "@/types/events";
import { CategoryFilterBar, type CategoryFilter } from "./CategoryFilterBar";
import { EventCard } from "./EventCard";
import { SearchBar } from "./SearchBar";

type SortMode = "newest" | "biggest";

const VALID_CATEGORIES: ReadonlySet<string> = new Set<string>([
  "ALL",
  ...FILTERABLE_CATEGORIES,
]);

const isValidCategory = (v: string | null): v is CategoryFilter =>
  v !== null && VALID_CATEGORIES.has(v);

const isValidSort = (v: string | null): v is SortMode =>
  v === "newest" || v === "biggest";

const PAGE_SIZE = 12;

interface EventsApiResponse {
  events: NewsEvent[];
  total: number;
  offset: number;
  limit: number;
  counts: Record<CategoryFilter, number>;
}

interface ApiErrorBody {
  error?: string;
  message?: string;
}

const ZERO_COUNTS: Record<CategoryFilter, number> = {
  ALL: 0,
  TARIFF: 0,
  INFLATION: 0,
  FED: 0,
  JOBS: 0,
  GEOPOLITICAL: 0,
  EARNINGS: 0,
  OTHER: 0,
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

  // Re-sync the input when the URL changes from outside this component (back /
  // forward navigation, or a link with ?q=). Adjusting state during render is
  // React's sanctioned pattern for "derive from a prop that changed"; doing it
  // in an effect costs an extra commit and trips react-hooks/set-state-in-effect.
  const [syncedQuery, setSyncedQuery] = useState(urlQuery);
  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery);
    setSearchInput(urlQuery);
  }

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

  const handleCategoryChange = useCallback(
    (cat: CategoryFilter) => updateParam("cat", cat === "ALL" ? null : cat),
    [updateParam],
  );

  const handleSortChange = useCallback(
    (sort: SortMode) => updateParam("sort", sort === "newest" ? null : sort),
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
        // Surface the server's message: "DATABASE_URL is not set" is actionable
        // where a bare status code sends people reading the wrong code.
        const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
        throw new Error(body?.message ?? `Failed to load events (${res.status})`);
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
        setCounts({ ...ZERO_COUNTS, ...data.counts });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setEvents([]);
        setTotal(0);
        setError(err instanceof Error ? err.message : "Failed to load events");
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
    () => ({ visible: events.length, total }),
    [events.length, total],
  );

  const filterBar = (
    <CategoryFilterBar
      active={category}
      onChange={handleCategoryChange}
      counts={counts}
    />
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
              <div className="lg:min-w-0 lg:flex-1">{filterBar}</div>
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
        {filterBar}
      </div>

      <div ref={stickyAnchorRef} className="h-px" />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="flex items-baseline gap-2 font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
          <span className="tabular-nums">
            {counterDisplay.visible} of {counterDisplay.total}
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

      {!initialLoad && !error && events.length === 0 ? (
        <EmptyState hasLibrary={counts.ALL > 0} />
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
                  className="block h-full rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF94]/40"
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

/**
 * "No matches" and "nothing ingested yet" are different problems with different
 * fixes, so they get different copy rather than one ambiguous message.
 */
function EmptyState({ hasLibrary }: { hasLibrary: boolean }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] px-6 py-16 text-center">
      {hasLibrary ? (
        <>
          <p className="text-zinc-300">No events match your search</p>
          <p className="mt-2 text-sm text-zinc-500">
            Try clearing your filters or searching for something else.
          </p>
        </>
      ) : (
        <>
          <p className="text-zinc-300">The event library is empty</p>
          <p className="mt-2 text-sm text-zinc-500">
            Load it with{" "}
            <code className="text-zinc-300">npm run ingest</code> for the curated
            events, or{" "}
            <code className="text-zinc-300">
              npm run auto-ingest -- --no-prices
            </code>{" "}
            for the bulk macro history.
          </p>
        </>
      )}
    </div>
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
        active ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}
