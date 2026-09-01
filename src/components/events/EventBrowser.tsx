"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import { buttonClass } from "@/components/ui/Button";
import { DataStatePanel } from "@/components/ui/DataStatePanel";
import { feedRows, rankedSummary } from "@/services/events/feedSections";
import {
  DEFAULT_LIMIT,
  ZERO_CATEGORY_COUNTS,
  feedQueryKey,
  type CategoryParam,
  type SortMode,
} from "@/services/events/queryParams";
import type { FeedSection } from "@/services/events/feedSections";
import type { NewsEvent } from "@/types/events";
import { CategoryFilterBar, type CategoryFilter } from "./CategoryFilterBar";
import { EventCard } from "./EventCard";
import { SearchBar } from "./SearchBar";

/**
 * The event library browser.
 *
 * ### Where its first page comes from
 *
 * `initial` — queried on the server by `app/feed/page.tsx` from the same URL
 * this component then keeps in sync. The component used to mount empty and
 * fetch page one itself, which cost a round trip after hydration and showed a
 * second skeleton under the page's own. It now starts with rows and only calls
 * `/api/events` for what the server did not send: later pages, and result sets
 * the reader asks for by changing a filter.
 *
 * ### Why filter state is state, not `useSearchParams`
 *
 * The URL is a *mirror* of the component's state rather than its source. Going
 * through the Next router for every keystroke would re-run the page's server
 * component — a second database query for a result set the client is already
 * fetching — so the URL is updated with `history.replaceState`, which Next
 * integrates with the router but which does not trigger a server navigation.
 * The server still owns the *initial* state: it parses the URL, renders page
 * one from it, and passes both down. A real navigation (a link to `/feed` with
 * different parameters) produces a new `initial.key`, and the page remounts
 * this component on that key so nothing stale survives.
 */

interface FeedResultState {
  events: NewsEvent[];
  total: number;
  rankedCount: number;
  counts: Record<CategoryParam, number>;
}

export interface FeedInitialData extends FeedResultState {
  /** Identity of the result set the server rendered. Also the remount key. */
  key: string;
  category: CategoryParam;
  sort: SortMode;
  search: string;
  /** Non-null when the server could not read the library at all. */
  error: string | null;
}

interface EventsApiResponse extends FeedResultState {
  offset: number;
  limit: number;
}

interface ApiErrorBody {
  error?: string;
  message?: string;
}

const setOrDelete = (
  params: URLSearchParams,
  key: string,
  value: string | null,
) => {
  if (value === null || value === "") params.delete(key);
  else params.set(key, value);
};

export function EventBrowser({ initial }: { initial: FeedInitialData }) {
  const pathname = usePathname();

  const [category, setCategory] = useState<CategoryFilter>(initial.category);
  const [sortMode, setSortMode] = useState<SortMode>(initial.sort);
  const [searchInput, setSearchInput] = useState(initial.search);
  const [search, setSearch] = useState(initial.search);

  const [result, setResult] = useState<FeedResultState>({
    events: initial.events,
    total: initial.total,
    rankedCount: initial.rankedCount,
    counts: initial.counts,
  });
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(false);
  const [error, setError] = useState<string | null>(initial.error);

  const { events, total, rankedCount, counts } = result;
  const queryKey = feedQueryKey({ category, sort: sortMode, search });

  // Debounce the box, not the URL: `search` is what both the request and the
  // address bar follow, so neither can run a query the other has not seen.
  useEffect(() => {
    if (searchInput.trim() === search) return;
    const t = setTimeout(() => setSearch(searchInput.trim()), 200);
    return () => clearTimeout(t);
  }, [searchInput, search]);

  // Mirror the state into the address bar so the view stays shareable.
  // `replaceState` rather than `router.replace`: this is the same document
  // showing a different slice of one dataset, and a server navigation per
  // keystroke would re-query Postgres for rows the fetch below is already
  // asking for. Unrelated parameters are preserved. On mount this is a no-op —
  // the state came from these very values.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setOrDelete(params, "cat", category === "ALL" ? null : category);
    setOrDelete(params, "sort", sortMode === "newest" ? null : sortMode);
    setOrDelete(params, "q", search);
    const qs = params.toString();
    const next = qs ? `${pathname}?${qs}` : pathname;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, "", next);
    }
  }, [category, sortMode, search, pathname]);

  const fetchEvents = useCallback(
    async (offset: number, signal: AbortSignal): Promise<EventsApiResponse> => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(DEFAULT_LIMIT),
        type: category,
        sort: sortMode,
      });
      if (search.length > 0) params.set("q", search);

      const res = await fetch(`/api/events?${params.toString()}`, { signal });
      if (!res.ok) {
        // Surface the server's message: "DATABASE_URL is not set" is actionable
        // where a bare status code sends people reading the wrong code.
        const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
        throw new Error(body?.message ?? `Failed to load events (${res.status})`);
      }
      return (await res.json()) as EventsApiResponse;
    },
    [category, sortMode, search],
  );

  // Refetch page one when the reader asks for a *different* result set — and
  // only then. The ref holds what has already been loaded, starting with what
  // the server sent, which is what keeps hydration from re-requesting it.
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
          counts: { ...ZERO_CATEGORY_COUNTS, ...data.counts },
        });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResult({
          events: [],
          total: 0,
          rankedCount: 0,
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
    if (loading) return;
    if (events.length >= total) return;
    const ac = new AbortController();
    setLoading(true);
    try {
      const data = await fetchEvents(events.length, ac.signal);
      setResult((prev) => {
        const seen = new Set(prev.events.map((e) => e.id));
        const next = data.events.filter((e) => !seen.has(e.id));
        return {
          events: [...prev.events, ...next],
          total: data.total,
          rankedCount: data.rankedCount,
          counts: prev.counts,
        };
      });
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

  // Headings are derived from the whole loaded list rather than per page, so a
  // month that straddles a page boundary keeps one heading.
  const rows = feedRows(events, { sort: sortMode, rankedCount, total });
  const ranked = sortMode === "biggest" ? rankedSummary(rankedCount, total) : null;

  const filterBar = (
    <CategoryFilterBar
      active={category}
      onChange={setCategory}
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
        <div className="min-w-0" aria-live="polite">
          <p className="text-[13px] text-ink-3">
            <span className="num font-semibold text-ink">{events.length}</span>
            <span className="text-ink-4"> of </span>
            <span className="num text-ink-2">{total}</span>
            <span className="text-ink-4"> {total === 1 ? "event" : "events"}</span>
          </p>
          {/* Under "Biggest move" the total is not the size of the ranking.
              Saying so here is the difference between "the 40th biggest move"
              and "the 20th event we could not rank at all". */}
          {ranked !== null && (
            <p className="mt-0.5 text-[11px] text-ink-4">{ranked}</p>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <span className="eyebrow">Sort</span>
          <div
            role="group"
            aria-label="Sort order"
            className="flex items-center gap-1 rounded-lg border border-line bg-canvas/60 p-1"
          >
            <SortButton
              active={sortMode === "newest"}
              onClick={() => setSortMode("newest")}
            >
              Newest
            </SortButton>
            <SortButton
              active={sortMode === "biggest"}
              onClick={() => setSortMode("biggest")}
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
          {rows.map(({ event, section }) => (
            <Fragment key={event.id}>
              {section !== null && <SectionHeading section={section} />}
              <Link
                href={`/events/${event.id}`}
                className="group block rounded-lg"
              >
                <EventCard event={event} />
              </Link>
            </Fragment>
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
 * A full-width break in the card grid.
 *
 * One row, a label and a rule — enough to make the boundary unmissable while
 * scrolling, small enough that it never competes with the cards it separates.
 * The unranked marker takes the amber of the rest of the product's coverage
 * vocabulary and a dashed rule, because it is the same statement those states
 * make: this is where the measured data stops.
 */
function SectionHeading({ section }: { section: FeedSection }) {
  const unranked = section.kind === "unranked";
  return (
    <div className="col-span-full flex items-center gap-3 pt-4 first:pt-0">
      <span
        className={`shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] ${
          unranked ? "text-warn/85" : "text-ink-3"
        }`}
      >
        {section.label}
      </span>
      <span
        aria-hidden
        className={`h-0 min-w-4 flex-1 border-t ${
          unranked ? "border-dashed border-warn/25" : "border-line"
        }`}
      />
      {section.detail !== null && (
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-4">
          {section.detail}
        </span>
      )}
    </div>
  );
}

/**
 * Shown only when the reader changes filter, sort or search. The first page
 * arrives from the server already rendered, so this is no longer what a visitor
 * meets on arrival.
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
