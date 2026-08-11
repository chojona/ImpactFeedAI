/**
 * Query-string parsing for the event list.
 *
 * Kept separate from `eventQueries.ts` so validation has no dependency on the
 * Prisma client: importing the client to check that `limit=abc` is invalid would
 * mean instantiating a database connection to answer a question about a string.
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
 * Parse the query string into a validated query. Unrecognised values fall back
 * to their defaults rather than erroring — a bookmarked URL naming a category
 * that no longer exists should still return the unfiltered feed.
 */
export function parseEventListQuery(params: URLSearchParams): EventListQuery {
  const typeRaw = params.get("type");
  const sortRaw = params.get("sort");
  return {
    category:
      typeRaw !== null && VALID_CATEGORIES.has(typeRaw)
        ? (typeRaw as CategoryParam)
        : "ALL",
    sort: sortRaw === "biggest" ? "biggest" : "newest",
    search: (params.get("q") ?? "").trim(),
    offset: parseNonNegativeInt(params.get("offset"), 0),
    limit: parseNonNegativeInt(params.get("limit"), DEFAULT_LIMIT, MAX_LIMIT),
  };
}
