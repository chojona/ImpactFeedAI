"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import { buttonClass } from "@/components/ui/Button";
import { DataStatePanel } from "@/components/ui/DataStatePanel";
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
            className="fixed inset-x-0 top-16 z-10 border-b border-line bg-canvas/92 backdrop-blur-xl"
          >
            <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-3 sm:px-6 lg:flex-row lg:items-center lg:gap-4">
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

      {/* One toolbar. Search and filters sit together because they narrow the
          same set; the count and the sort order sit together on the row below
          because both describe the result. Previously the count was a lone
          uppercase label floating opposite the sort control with no visual
          relationship to either. */}
      <div className="flex flex-col gap-3">
        <SearchBar
          value={searchInput}
          onChange={setSearchInput}
          resultCount={events.length}
        />
        {filterBar}
      </div>

      <div ref={stickyAnchorRef} className="h-px" />

      <div className="mt-6 mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line pb-3.5">
        <p className="text-[13px] text-ink-3" aria-live="polite">
          <span className="num font-semibold text-ink">
            {counterDisplay.visible}
          </span>
          <span className="text-ink-4"> of </span>
          <span className="num text-ink-2">{counterDisplay.total}</span>
          <span className="text-ink-4">
            {" "}
            {counterDisplay.total === 1 ? "event" : "events"}
          </span>
        </p>
        <div className="flex items-center gap-2.5">
          <span className="eyebrow">Sort</span>
          <div
            role="group"
            aria-label="Sort order"
            className="flex items-center gap-1 rounded-lg border border-line bg-canvas/60 p-1"
          >
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
              Biggest move
            </SortButton>
          </div>
        </div>
      </div>

      {error && (
        <DataStatePanel
          state="error"
          title="Could not load the event library"
          className="mb-6"
          footnote="This is a request or database failure rather than an empty library — an empty library renders its own state."
        >
          {error}
        </DataStatePanel>
      )}

      {initialLoad ? (
        <SkeletonGrid />
      ) : !error && events.length === 0 ? (
        <EmptyState hasLibrary={counts.ALL > 0} />
      ) : (
        // `items-start` lets every card size to its own content. Stretching
        // them to a shared row height is what produced the large blank areas
        // inside cards for the majority of events that carry no reaction.
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {events.map((event) => (
            <Link
              key={event.id}
              href={`/events/${event.id}`}
              className="group block rounded-lg"
            >
              <EventCard event={event} />
            </Link>
          ))}
        </div>
      )}

      <div ref={loadSentinelRef} className="h-px" aria-hidden />

      <div aria-live="polite" className="flex justify-center py-8">
        {loading && !initialLoad ? (
          <Spinner />
        ) : hasMore ? (
          // Infinite scroll is a mouse affordance. The button is the same
          // action reachable by keyboard and announced to assistive tech.
          <button
            type="button"
            onClick={() => void loadMore()}
            className={buttonClass("secondary", "md")}
          >
            Load more events
          </button>
        ) : events.length > 0 ? (
          <p className="eyebrow">End of results</p>
        ) : null}
      </div>
    </>
  );
}

/**
 * Shown only on the first load of a filter. Matching the card grid's shape
 * keeps the layout from jumping when the real rows arrive.
 */
function SkeletonGrid() {
  return (
    <div
      className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3"
      aria-hidden
    >
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="surface-lift flex flex-col gap-3 rounded-lg border border-line bg-surface-1 p-4 sm:p-[18px]"
        >
          {/* Shaped like the real card rather than a plain block, so the
              layout does not reflow when the rows arrive. */}
          <div className="flex items-start justify-between gap-3">
            <div className="h-4 w-16 animate-pulse rounded bg-white/[0.05]" />
            <div className="space-y-1.5">
              <div className="h-2.5 w-20 animate-pulse rounded bg-white/[0.05]" />
              <div className="ml-auto h-2 w-14 animate-pulse rounded bg-white/[0.03]" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-3.5 w-full animate-pulse rounded bg-white/[0.05]" />
            <div className="h-3.5 w-3/5 animate-pulse rounded bg-white/[0.05]" />
          </div>
          <div className="space-y-2 rounded-md border border-line bg-surface-2 px-3 py-2.5">
            <div className="h-3 w-2/5 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-1.5 w-full animate-pulse rounded-full bg-white/[0.04]" />
            <div className="h-1.5 w-full animate-pulse rounded-full bg-white/[0.04]" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * "No matches" and "nothing ingested yet" are different problems with different
 * fixes, so they get different copy rather than one ambiguous message.
 */
function EmptyState({ hasLibrary }: { hasLibrary: boolean }) {
  if (hasLibrary) {
    return (
      <DataStatePanel
        state="unavailable"
        title="No events match this search"
        footnote="The library itself is not empty — only this combination of query and category is."
      >
        Try clearing the category filter or searching for a metric name such as
        CPI, payrolls or the federal funds rate.
      </DataStatePanel>
    );
  }
  return (
    <DataStatePanel
      state="pending"
      title="The event library is empty"
      footnote={
        <>
          Load it with{" "}
          <code className="num text-ink-2">npm run ingest</code> for the curated
          events, or{" "}
          <code className="num text-ink-2">
            npm run auto-ingest -- --no-prices
          </code>{" "}
          for the bulk macro history.
        </>
      }
    >
      Nothing has been ingested into this database yet, so there is nothing to
      search or filter.
    </DataStatePanel>
  );
}

/**
 * Deliberately small and paired with a word. A large spinner in the middle of a
 * page implies the whole view is reloading, when in fact the rows already read
 * are still valid and only the next page is in flight.
 */
function Spinner() {
  return (
    <span role="status" className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand/25 border-t-brand-bright"
      />
      <span className="eyebrow">Loading more events</span>
    </span>
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
      aria-pressed={active}
      className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-brand/45 bg-brand-tint-strong text-brand-bright"
          : "border-transparent text-ink-3 hover:bg-brand-tint hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
