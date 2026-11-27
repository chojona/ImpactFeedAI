import type {
  CategoryParam,
  SortMode,
} from "@/services/events/queryParams";
import type { NewsEvent } from "@/types/events";

export interface FeedResultState {
  events: NewsEvent[];
  total: number;
  rankedCount: number;
  /**
   * Unfiltered event-table size. Distinct from filtered `total` / `counts.ALL`
   * so a zero-result search can still admit the library is non-empty.
   */
  libraryTotal: number;
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

export interface EventsApiResponse extends FeedResultState {
  offset: number;
  limit: number;
}

export interface ApiErrorBody {
  error?: string;
  message?: string;
}
