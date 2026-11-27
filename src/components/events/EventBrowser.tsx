"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { feedRows, rankedSummary } from "@/services/events/feedSections";
import { CategoryFilterBar } from "./CategoryFilterBar";
import { EventBrowserResults } from "./EventBrowserResults";
import { EventBrowserSortBar } from "./EventBrowserSortBar";
import { EventBrowserStickyChrome } from "./EventBrowserStickyChrome";
import type { FeedInitialData } from "./EventBrowserTypes";
import { SearchBar } from "./SearchBar";
import { useEventBrowserFeed } from "./useEventBrowserFeed";

export type { FeedInitialData } from "./EventBrowserTypes";

/**
 * The event library browser.
 *
 * Page one arrives from `app/feed/page.tsx` as `initial`. Filter / sort / search
 * changes fetch `/api/events` client-side and mirror into the URL: category and
 * sort push history entries; search typing replaces the current entry.
 */
export function EventBrowser({ initial }: { initial: FeedInitialData }) {
  const pathname = usePathname();
  const feed = useEventBrowserFeed(initial, pathname);
  const { events, total, rankedCount, libraryTotal, counts } = feed.result;
  const { loadMore } = feed;

  const [stickyVisible, setStickyVisible] = useState(false);
  const stickyAnchorRef = useRef<HTMLDivElement | null>(null);
  const loadSentinelRef = useRef<HTMLDivElement | null>(null);
  const hasMore = events.length < total;

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

  useEffect(() => {
    const sentinel = loadSentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const rows = feedRows(events, {
    sort: feed.sortMode,
    rankedCount,
    total,
  });
  const ranked =
    feed.sortMode === "biggest" ? rankedSummary(rankedCount, total) : null;

  return (
    <>
      <EventBrowserStickyChrome
        visible={stickyVisible}
        searchInput={feed.searchInput}
        onSearchChange={feed.setSearchInput}
        resultCount={events.length}
        category={feed.category}
        onCategoryChange={feed.setCategory}
        counts={counts}
      />

      <div className="flex flex-col gap-3">
        <SearchBar
          value={feed.searchInput}
          onChange={feed.setSearchInput}
          resultCount={events.length}
        />
        <CategoryFilterBar
          active={feed.category}
          onChange={feed.setCategory}
          counts={counts}
        />
      </div>

      <div ref={stickyAnchorRef} className="h-px" />

      <EventBrowserSortBar
        eventsLoaded={events.length}
        total={total}
        ranked={ranked}
        sortMode={feed.sortMode}
        onSortChange={feed.setSortMode}
      />

      <EventBrowserResults
        error={feed.error}
        initialLoad={feed.initialLoad}
        loading={feed.loading}
        hasLibrary={libraryTotal > 0}
        rows={rows}
        hasMore={hasMore}
        eventsLoaded={events.length}
        onLoadMore={() => void feed.loadMore()}
        loadSentinelRef={loadSentinelRef}
      />
    </>
  );
}
