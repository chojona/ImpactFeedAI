/**
 * Query-string parsing for the event list.
 *
 * Kept separate from `eventQueries.ts` so validation has no dependency on the
 * Prisma client: importing the client to check that `limit=abc` is invalid would
 * mean instantiating a database connection to answer a question about a string.
 *
 * Two vocabularies, one validator. The HTTP API names the category `type`; the
 * browser URL on `/feed` names it `cat`, and that spelling is in shared links
 * and bookmarks, so neither can be renamed to match the other. `parseFeedQuery`
 * and `parseEventListQuery` therefore differ only in which key they read the
 * category from — everything else, including the clamping rules, is one
 * definition. The feed page and `EventBrowser` now both parse the *same* URL
 * through the same function, which is what lets the server render page one and
 * the client agree on what it rendered.
 */
import { FILTERABLE_CATEGORIES } from "@/lib/eventCategories";
import type { EventCategory } from "@/types/events";

export type SortMode = "newest" | "biggest";
export type CategoryParam = EventCategory | "ALL";

export const DEFAULT_LIMIT = 12;
export const MAX_LIMIT = 100;

export interface EventListQuery {
  category: CategoryParam;
  sort: SortMode;
  search: string;
  offset: number;
  limit: number;
}

const VALID_CATEGORIES: ReadonlySet<string> = new Set<string>([
  "ALL",
  ...FILTERABLE_CATEGORIES,
]);

/**
 * Clamp rather than reject. `limit=1000` becomes `MAX_LIMIT` instead of a 400:
 * the caller asked for more than the page size allows, which is answerable.
 * Anything non-numeric, negative or fractional falls back to the default.
 */
const parseNonNegativeInt = (
  raw: string | null,
  fallback: number,
  max?: number,
): number => {
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return fallback;
  if (max !== undefined && n > max) return max;
  return n;
};

/**
 * An all-zero count for every filter pill.
 *
 * Shared so the server's error paths, the client's reset path and the filter
 * bar cannot disagree about the shape of the record — a missing key renders as
 * an empty pill rather than a zero.
 */
export const ZERO_CATEGORY_COUNTS: Readonly<Record<CategoryParam, number>> = {
  ALL: 0,
  ...(Object.fromEntries(
    FILTERABLE_CATEGORIES.map((category) => [category, 0]),
  ) as Record<EventCategory, number>),
};

export const parseCategory = (raw: string | null): CategoryParam =>
  raw !== null && VALID_CATEGORIES.has(raw) ? (raw as CategoryParam) : "ALL";

export const parseSort = (raw: string | null): SortMode =>
  raw === "biggest" ? "biggest" : "newest";

/**
 * Parse a query string into a validated query, given the key the category is
 * spelled with. Unrecognised values fall back to their defaults rather than
 * erroring — a bookmarked URL naming a category that no longer exists should
 * still return the unfiltered feed.
 */
function parse(params: URLSearchParams, categoryKey: string): EventListQuery {
  return {
    category: parseCategory(params.get(categoryKey)),
    sort: parseSort(params.get("sort")),
    search: (params.get("q") ?? "").trim(),
    offset: parseNonNegativeInt(params.get("offset"), 0),
    limit: parseNonNegativeInt(params.get("limit"), DEFAULT_LIMIT, MAX_LIMIT),
  };
}

/** The `/api/events` contract, where the category is `type`. */
export const parseEventListQuery = (params: URLSearchParams): EventListQuery =>
  parse(params, "type");

/** The `/feed` browser URL, where the category is `cat`. */
export const parseFeedQuery = (params: URLSearchParams): EventListQuery =>
  parse(params, "cat");

/**
 * Identity of a result *set*, ignoring how far into it the reader has paged.
 *
 * The server renders page one for one of these; the client refetches when the
 * reader changes to a different one. Comparing the strings is what keeps
 * hydration from re-requesting the page the server already sent.
 */
export const feedQueryKey = (
  query: Pick<EventListQuery, "category" | "sort" | "search">,
): string => `${query.category}|${query.sort}|${query.search}`;
