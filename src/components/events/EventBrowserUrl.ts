import type { CategoryParam, SortMode } from "@/services/events/queryParams";
import { parseFeedQuery } from "@/services/events/queryParams";

const setOrDelete = (
  params: URLSearchParams,
  key: string,
  value: string | null,
) => {
  if (value === null || value === "") params.delete(key);
  else params.set(key, value);
};

export interface FeedUrlSnapshot {
  category: CategoryParam;
  sort: SortMode;
  search: string;
}

/** Build the shareable `/feed` URL for the current filter state. */
export function feedUrlFromState(
  pathname: string,
  { category, sort, search }: FeedUrlSnapshot,
): string {
  const params = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : "",
  );
  setOrDelete(params, "cat", category === "ALL" ? null : category);
  setOrDelete(params, "sort", sort === "newest" ? null : sort);
  setOrDelete(params, "q", search);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Mirror filter state into the address bar.
 *
 * Category and sort changes push a history entry so Back steps through them.
 * Search typing replaces the current entry so each keystroke does not pile up.
 */
export function syncFeedUrl(
  pathname: string,
  next: FeedUrlSnapshot,
  prev: FeedUrlSnapshot,
): void {
  const url = feedUrlFromState(pathname, next);
  const current = `${window.location.pathname}${window.location.search}`;
  if (url === current) return;

  const searchOnly =
    prev.category === next.category &&
    prev.sort === next.sort &&
    prev.search !== next.search;

  if (searchOnly) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
}

/** Read the feed URL the browser just navigated to (Back / Forward). */
export function feedStateFromLocation(): FeedUrlSnapshot {
  const parsed = parseFeedQuery(new URLSearchParams(window.location.search));
  return {
    category: parsed.category,
    sort: parsed.sort,
    search: parsed.search,
  };
}
