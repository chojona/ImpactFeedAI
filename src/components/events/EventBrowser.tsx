"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import type { NewsEvent } from "@/lib/types";
import { CategoryFilterBar, type CategoryFilter } from "./CategoryFilterBar";
import { EventCard } from "./EventCard";
import { SearchBar } from "./SearchBar";

type SortMode = "newest" | "biggest";

interface Props {
  events: NewsEvent[];
}

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

const maxAbsMove = (event: NewsEvent): number => {
  let m = 0;
  for (const a of event.assets) {
    const x = Math.abs(a.percentChange);
    if (x > m) m = x;
  }
  return m;
};

const TOTAL_LIBRARY_SIZE = 142;

export function EventBrowser({ events }: Props) {
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

  const [stickyVisible, setStickyVisible] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const handler = () => {
      setStickyVisible(sentinel.getBoundingClientRect().top < 64);
    };
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const counts = useMemo<Record<CategoryFilter, number>>(() => {
    const result: Record<CategoryFilter, number> = {
      ALL: events.length,
      TARIFF: 0,
      INFLATION: 0,
      FED: 0,
      GEOPOLITICAL: 0,
      EARNINGS: 0,
    };
    for (const e of events) {
      if (e.category === "OTHER") continue;
      result[e.category] += 1;
    }
    return result;
  }, [events]);

  const filtered = useMemo(() => {
    const q = urlQuery.toLowerCase().trim();
    const list = events.filter((e) => {
      if (category !== "ALL" && e.category !== category) return false;
      if (q.length > 0) {
        const hay = `${e.title} ${e.summary} ${e.explanation}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return [...list].sort((a, b) => {
      if (sortMode === "newest") {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      return maxAbsMove(b) - maxAbsMove(a);
    });
  }, [events, urlQuery, category, sortMode]);

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
                  resultCount={filtered.length}
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
          resultCount={filtered.length}
        />
        <CategoryFilterBar
          active={category}
          onChange={handleCategoryChange}
          counts={counts}
        />
      </div>

      <div ref={sentinelRef} className="h-px" />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="flex items-baseline gap-2 font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
          <span className="tabular-nums">
            {filtered.length} of {TOTAL_LIBRARY_SIZE}
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

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-6 py-16 text-center">
          <p className="text-zinc-300">No events match your search</p>
          <p className="mt-2 text-sm text-zinc-500">
            Try clearing your filters or searching for something else.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((event) => (
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
    </>
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
