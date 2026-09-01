/**
 * Where the feed grid breaks into sections, and why.
 *
 * The feed is one flat grid of cards, which quietly asserts that every card in
 * it is comparable to every other. Under both sort orders that is false, in two
 * different ways, and this module is the single place that says so:
 *
 *   newest  — the list is chronological, so it breaks on calendar boundaries.
 *             The heading is the only thing that makes "how far back am I now"
 *             answerable without reading the date on every card.
 *   biggest — the list is two runs, not one ranking. Events with a measured
 *             one-session move are ranked; the rest cannot be ranked at all and
 *             follow in date order. Without a marker the fortieth card looks
 *             like the fortieth-biggest move, when in fact it is the twentieth
 *             event with no move at all.
 *
 * Pure and total: it takes the loaded rows plus the counts the query layer
 * reported and returns what to render. It never fetches, never reads a clock it
 * was not given, and never invents a date — the day it groups by comes from
 * `eventWhenDisplay`, so a card cannot land under a heading that contradicts
 * its own date line.
 *
 * Sections are derived from the whole accumulated list on every render rather
 * than remembered per page, which is what makes them survive pagination: a
 * group that straddles a page boundary keeps one heading, and a heading is
 * never repeated because a new page happened to start inside it.
 */
import {
  eventDateGroup,
  eventWhenDisplay,
  type EventDateGroup,
} from "@/services/events/timing";
import type { SortMode } from "@/services/events/queryParams";
import type { NewsEvent } from "@/types/events";

export type FeedSectionKind = "date" | "unranked";

export interface FeedSection {
  kind: FeedSectionKind;
  key: string;
  label: string;
  /** Quiet second line. Null when the label says everything. */
  detail: string | null;
}

/** One card, plus the heading that precedes it (null for most cards). */
export interface FeedRow {
  event: NewsEvent;
  section: FeedSection | null;
}

export interface FeedSectionInput {
  sort: SortMode;
  /**
   * How many results in the *whole* filtered set carry a measured one-session
   * move, from `EventListResult.rankedCount`. Not inferable from the loaded
   * page: twelve ranked cards look identical whether the ranking ends at
   * twelve or at two hundred.
   */
  rankedCount: number;
  /** Size of the whole filtered set, for the unranked tail's count. */
  total: number;
  /** Injected so "Today" is testable and stays a pure function. */
  now?: Date;
}

const plural = (n: number, word: string): string =>
  `${n} ${word}${n === 1 ? "" : "s"}`;

const dateSection = (group: EventDateGroup): FeedSection => ({
  kind: "date",
  key: group.key,
  label: group.label,
  detail: null,
});

/**
 * The boundary between the ranked run and the tail that cannot be ranked.
 *
 * Named for what is true of the events below it rather than for the ranking
 * ("Unranked" would read as a judgement of the events, when it is a statement
 * about our price coverage), and it carries the tail's size so the reader can
 * see how much of the result set the ranking never reached.
 */
const unrankedSection = (unrankedTotal: number): FeedSection => ({
  kind: "unranked",
  key: "unranked",
  label: "No measured 1D reaction",
  detail: `${plural(unrankedTotal, "event")} · newest first`,
});

/**
 * Attach section headings to the loaded events.
 *
 * A heading is emitted only where its boundary actually falls inside the loaded
 * rows: the unranked marker does not appear until at least one unranked event
 * has been paged in, so the reader is never shown a boundary with nothing under
 * it.
 */
export function feedRows(
  events: readonly NewsEvent[],
  { sort, rankedCount, total, now }: FeedSectionInput,
): FeedRow[] {
  if (sort === "biggest") {
    const unrankedTotal = Math.max(total - rankedCount, 0);
    return events.map((event, index) => ({
      event,
      section:
        index === rankedCount && unrankedTotal > 0
          ? unrankedSection(unrankedTotal)
          : null,
    }));
  }

  let openKey: string | null = null;
  return events.map((event) => {
    const group = eventDateGroup(eventWhenDisplay(event).day, now);
    if (group.key === openKey) return { event, section: null };
    openKey = group.key;
    return { event, section: dateSection(group) };
  });
}

/**
 * The one-line honest description of a `biggest` result set.
 *
 * The counter above the grid used to read "24 of 50 events" in both sorts,
 * which under "Biggest move" claims a ranking over all fifty. Only the events
 * with a measured move are ranked; the rest are appended because dropping them
 * would hide half the library behind a sort control.
 */
export function rankedSummary(
  rankedCount: number,
  total: number,
): string | null {
  if (total === 0) return null;
  const unranked = Math.max(total - rankedCount, 0);
  const ranked = `${plural(rankedCount, "event")} ranked by 1D move`;
  return unranked === 0
    ? ranked
    : `${ranked} · ${unranked} without measured 1D reaction`;
}
