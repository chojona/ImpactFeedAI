/**
 * Event reads against Postgres.
 *
 * This is the layer that replaced `src/lib/mock-data/`. The query-parameter
 * contract (`type`, `q`, `sort`, `offset`, `limit`) and the response envelope
 * (`{ events, total, rankedCount, offset, limit, counts }`) is additive, so
 * `EventBrowser` did not have to move with it.
 *
 * Two sorts, deliberately implemented differently:
 *
 *   newest  — a plain indexed `ORDER BY occurred_at DESC`.
 *   biggest — orders by the largest absolute move across an event's asset
 *             reactions. That is an aggregate over a child table, so it is one
 *             raw SQL pass that returns ids, followed by a normal `findMany`.
 *             Doing it in JavaScript would mean loading every matching event to
 *             sort twelve rows per event, which stops working at the ~2,000
 *             events a full backfill produces.
 *
 * Both sorts tie-break on `id` so pagination is stable: without it, two events
 * sharing a timestamp can swap places between page requests and an event is
 * either shown twice or skipped.
 *
 * `biggest` returns two runs, not one ordering: the events that have a measured
 * one-session move, ranked; then the ones that do not, which no ranking can
 * order and which fall out in date order behind them. `rankedCount` reports
 * where the first run ends so the reader is not told that fifty results are
 * ranked when twenty are.
 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  FILTERABLE_CATEGORIES,
  categoryForEventType,
  eventTypesForCategory,
} from "@/lib/eventCategories";
import type { ReactionObservation } from "@/services/analytics/patternAnalysis";
import { mapEvent, type EventRow } from "@/services/events/mapEvent";
import {
  CURRENT_REACTION_CALCULATION_VERSION,
  REACTION_ELIGIBLE_TIMING_STATUSES,
  reactionTimingEligibility,
} from "@/services/events/timing";
import type {
  CategoryParam,
  EventListQuery,
} from "@/services/events/queryParams";
import type { EventCategory, EventTypeName, NewsEvent } from "@/types/events";

export interface EventListResult {
  events: NewsEvent[];
  total: number;
  /**
   * How many of `total` can actually be ranked by move — that is, how many
   * carry a measured one-session reaction.
   *
   * Reported by the query layer rather than counted client-side, because the
   * client only ever holds the pages it has loaded: from twelve rows it cannot
   * tell whether the ranking ends at row twenty or row two hundred. Under
   * `sort=biggest` the first `rankedCount` results are the ranked ones and
   * everything after them is unranked, so this number is also where the
   * boundary falls.
   */
  rankedCount: number;
  offset: number;
  limit: number;
  counts: Record<CategoryParam, number>;
}

/* ───────────────────────────── query building ────────────────────────── */

const EVENT_INCLUDE = {
  assetReactions: true,
  dataReleases: true,
} as const;

/**
 * Free-text filter. Searches the stored headline and explanation only — the
 * summary the UI shows is derived at render time and has no column to match on.
 * `mode: "insensitive"` maps to ILIKE.
 */
function searchFilter(search: string): Prisma.EventWhereInput {
  if (search.length === 0) return {};
  return {
    OR: [
      { headline: { contains: search, mode: "insensitive" } },
      { explanation: { contains: search, mode: "insensitive" } },
      { dataReleases: { some: { metricName: { contains: search, mode: "insensitive" } } } },
    ],
  };
}

function categoryFilter(category: CategoryParam): Prisma.EventWhereInput {
  if (category === "ALL") return {};
  const types = eventTypesForCategory(category);
  return { eventType: { in: types as EventTypeName[] } };
}

/**
 * Per-category counts for the filter bar, computed with one grouped query
 * rather than one query per category. Honours the text filter but not the
 * category filter — the bar has to show what selecting a *different* category
 * would yield.
 */
async function categoryCounts(
  search: string,
): Promise<Record<CategoryParam, number>> {
  const grouped = await prisma.event.groupBy({
    by: ["eventType"],
    where: searchFilter(search),
    _count: { _all: true },
  });

  const counts = { ALL: 0 } as Record<CategoryParam, number>;
  for (const category of FILTERABLE_CATEGORIES) counts[category] = 0;

  for (const row of grouped) {
    const n = row._count._all;
    counts.ALL += n;
    for (const category of FILTERABLE_CATEGORIES) {
      if (eventTypesForCategory(category).includes(row.eventType)) {
        counts[category] += n;
        break;
      }
    }
  }
  return counts;
}

/**
 * The one definition of "this event has a move worth ranking by".
 *
 * A `Prisma.Sql` fragment rather than a copied string so the ranking and the
 * count of ranked rows cannot disagree — the whole point of `rankedCount` is
 * that it marks the exact index where the ranking stops, and it can only do
 * that if it is computed from the identical predicate. It refers to the aliases
 * `e` (events) and `ar` (asset_reactions), so every query embedding it must use
 * those names.
 *
 * The clauses mirror `reactionTimingEligibility` plus the calculation-version
 * gate: a plausible number attached to unsourced timing is exactly the thing
 * this product refuses to rank.
 */
const MEASURABLE_1D_REACTION = Prisma.sql`
  ar.calculation_version = ${CURRENT_REACTION_CALCULATION_VERSION}
  AND ar.pct_change_1d IS NOT NULL
  AND ABS(ar.pct_change_1d) < 'Infinity'::double precision
  AND e.timing_status IN ('VERIFIED', 'SCHEDULED')
  AND e.release_at IS NOT NULL
  AND NULLIF(BTRIM(e.timing_source), '') IS NOT NULL
`;

/**
 * Ids for one page ordered by largest absolute measured move.
 *
 * Rankings use one fixed financial horizon: the measured one-session move.
 * Falling back from 1d to 1w or 1h would compare unlike outcomes in the same
 * ordering. The join also enforces the same timing and calculation-version
 * eligibility as the mapper, so legacy rows cannot influence the ranking even
 * if they remain in the database pending repair.
 * `NULLS LAST` keeps events with no measured reaction in the result set instead
 * of letting the join drop them.
 *
 * Filtering runs through Prisma and only the *ordering* runs as raw SQL, at the
 * cost of passing the matching ids back in. That keeps one definition of the
 * filter: expressing it a second time in SQL is how the two sort modes end up
 * silently disagreeing about which events match. The id list is bounded by the
 * category+search filter and the corpus is a few thousand events, so the `IN`
 * stays well inside what Postgres handles comfortably.
 */
async function idsByBiggestMove(
  ids: string[],
  offset: number,
  limit: number,
): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT e.id
    FROM events e
    LEFT JOIN asset_reactions ar
      ON ar.event_id = e.id
      AND ${MEASURABLE_1D_REACTION}
    WHERE e.id IN (${Prisma.join(ids)})
    GROUP BY e.id, e.occurred_at
    ORDER BY
      MAX(ABS(ar.pct_change_1d)) DESC NULLS LAST,
      e.occurred_at DESC,
      e.id ASC
    LIMIT ${limit} OFFSET ${offset}
  `);
  return rows.map((r) => r.id);
}

/**
 * How many of the matching events have a move to be ranked by.
 *
 * Same predicate object as the ranking join, not a second spelling of it. The
 * number's only job is to say where the ranked run ends, so a count that admits
 * one row the ranking rejects would put the boundary marker in the wrong place
 * and quietly relabel a ranked event as unranked.
 *
 * It costs one aggregate over the already-computed id list. That list is fetched
 * for every sort, including `newest`, which is a real (small) cost: the
 * alternative is expressing the eligibility rule a second time in Prisma's
 * filter language, where `NULLIF(BTRIM(timing_source), '')` has no equivalent
 * and the two definitions would drift apart silently.
 */
async function countRankable(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
    SELECT COUNT(DISTINCT e.id)::int AS n
    FROM events e
    JOIN asset_reactions ar
      ON ar.event_id = e.id
      AND ${MEASURABLE_1D_REACTION}
    WHERE e.id IN (${Prisma.join(ids)})
  `);
  return rows[0]?.n ?? 0;
}

/* ────────────────────────────── public API ───────────────────────────── */

export async function listEvents(
  query: EventListQuery,
): Promise<EventListResult> {
  const where: Prisma.EventWhereInput = {
    ...categoryFilter(query.category),
    ...searchFilter(query.search),
  };

  const [counts, matching] = await Promise.all([
    categoryCounts(query.search),
    prisma.event.findMany({ where, select: { id: true } }),
  ]);
  const total = counts[query.category] ?? 0;
  const matchingIds = matching.map((e) => e.id);
  const rankedCount = await countRankable(matchingIds);

  let events: NewsEvent[];
  if (query.sort === "biggest") {
    const ids = await idsByBiggestMove(matchingIds, query.offset, query.limit);
    const rows = await prisma.event.findMany({
      where: { id: { in: ids } },
      include: EVENT_INCLUDE,
    });
    // `findMany` does not preserve the `IN` order; restore the ranking.
    const byId = new Map(rows.map((r) => [r.id, r]));
    events = ids
      .map((id) => byId.get(id))
      .filter((r): r is (typeof rows)[number] => r !== undefined)
      .map((r) => mapEvent(r as EventRow));
  } else {
    const rows = await prisma.event.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
      skip: query.offset,
      take: query.limit,
      include: EVENT_INCLUDE,
    });
    events = rows.map((r) => mapEvent(r as EventRow));
  }

  return {
    events,
    total,
    rankedCount,
    offset: query.offset,
    limit: query.limit,
    counts,
  };
}

export async function getEventById(id: string): Promise<NewsEvent | null> {
  const row = await prisma.event.findUnique({
    where: { id },
    include: EVENT_INCLUDE,
  });
  return row === null ? null : mapEvent(row as EventRow);
}

/** Total row count, used to distinguish "no data yet" from "no matches". */
export async function countAllEvents(): Promise<number> {
  return prisma.event.count();
}

/* ─────────────────── narrow aggregates for the research views ─────────── */

/**
 * Every measured reaction in the library, as flat observations.
 *
 * Replaces the pattern page's previous approach of hydrating up to 500 fully
 * included events per category — seven categories, twelve reactions and every
 * data release each — only to read three numbers per row. This selects the
 * three numbers.
 *
 * The SQL predicate mirrors `reactionTimingEligibility`, and the result is then
 * passed through that function anyway. The duplication is deliberate: the query
 * exists to avoid loading rows that will be discarded, and the function remains
 * the single authority on whether a row is publishable. A blank-but-present
 * `timing_source` is exactly the case SQL is clumsy at and the predicate is
 * precise about.
 */
export async function listReactionObservations(
  category?: EventCategory,
  take = 2000,
): Promise<ReactionObservation[]> {
  const rows = await prisma.event.findMany({
    where: {
      ...(category ? categoryFilter(category) : {}),
      timingStatus: { in: [...REACTION_ELIGIBLE_TIMING_STATUSES] },
      releaseAt: { not: null },
      timingSource: { not: null },
      assetReactions: {
        some: { calculationVersion: CURRENT_REACTION_CALCULATION_VERSION },
      },
    },
    orderBy: [{ releaseAt: "desc" }, { id: "asc" }],
    take,
    select: {
      id: true,
      headline: true,
      eventType: true,
      releaseAt: true,
      timingStatus: true,
      timingSource: true,
      assetReactions: {
        where: { calculationVersion: CURRENT_REACTION_CALCULATION_VERSION },
        select: {
          assetSymbol: true,
          pctChange1h: true,
          pctChange1d: true,
          pctChange1w: true,
        },
      },
    },
  });

  const observations: ReactionObservation[] = [];
  for (const row of rows) {
    const eligibility = reactionTimingEligibility({
      releaseAt: row.releaseAt,
      timingStatus: row.timingStatus,
      timingSource: row.timingSource,
    });
    if (!eligibility.eligible || row.releaseAt === null) continue;
    const at = row.releaseAt.toISOString();
    const eventCategory = categoryForEventType(row.eventType);
    for (const reaction of row.assetReactions) {
      observations.push({
        eventId: row.id,
        title: row.headline,
        at,
        category: eventCategory,
        symbol: reaction.assetSymbol,
        values: {
          "1h": finite(reaction.pctChange1h),
          "1d": finite(reaction.pctChange1d),
          "1w": finite(reaction.pctChange1w),
        },
      });
    }
  }
  return observations;
}

const finite = (value: number | null): number | null =>
  value !== null && Number.isFinite(value) ? value : null;

/**
 * What the library actually holds, per category.
 *
 * This is the honest answer to "what can I research here". Three grouped
 * aggregate queries, no row hydration — the counts are computed by Postgres.
 */
export interface CategoryCoverage {
  category: EventCategory;
  events: number;
  /** Events whose stored timing could anchor a reaction. */
  trustedTiming: number;
  /** Events with a publication date but no defensible instant. */
  dateOnly: number;
  /** Events known only by the period the statistic measures. */
  referencePeriodOnly: number;
  /** Events whose timing is inferred or simply unverified. */
  untrustedTiming: number;
  consensusVerified: number;
  consensusUnverified: number;
  consensusMissing: number;
  /** Events with at least one current-version measured one-day move. */
  measuredEvents: number;
}

export interface LibraryCoverage {
  categories: CategoryCoverage[];
  totals: Omit<CategoryCoverage, "category">;
}

interface CoverageRow {
  event_type: EventTypeName;
  n: number;
}

export async function getLibraryCoverage(): Promise<LibraryCoverage> {
  const [byTiming, byConsensus, measured] = await Promise.all([
    prisma.event.groupBy({
      by: ["eventType", "timingStatus"],
      _count: { _all: true },
    }),
    prisma.$queryRaw<
      { event_type: EventTypeName; consensus_status: string; n: number }[]
    >(Prisma.sql`
      SELECT e.event_type, dr.consensus_status, COUNT(*)::int AS n
      FROM data_releases dr
      JOIN events e ON e.id = dr.event_id
      GROUP BY e.event_type, dr.consensus_status
    `),
    prisma.$queryRaw<CoverageRow[]>(Prisma.sql`
      SELECT e.event_type, COUNT(DISTINCT e.id)::int AS n
      FROM events e
      JOIN asset_reactions ar ON ar.event_id = e.id
      WHERE ar.calculation_version = ${CURRENT_REACTION_CALCULATION_VERSION}
        AND ar.pct_change_1d IS NOT NULL
        AND e.timing_status IN ('VERIFIED', 'SCHEDULED')
        AND e.release_at IS NOT NULL
        AND NULLIF(BTRIM(e.timing_source), '') IS NOT NULL
      GROUP BY e.event_type
    `),
  ]);

  const blank = (category: EventCategory): CategoryCoverage => ({
    category,
    events: 0,
    trustedTiming: 0,
    dateOnly: 0,
    referencePeriodOnly: 0,
    untrustedTiming: 0,
    consensusVerified: 0,
    consensusUnverified: 0,
    consensusMissing: 0,
    measuredEvents: 0,
  });

  const byCategory = new Map<EventCategory, CategoryCoverage>(
    FILTERABLE_CATEGORIES.map((category) => [category, blank(category)]),
  );
  const bucket = (type: EventTypeName): CategoryCoverage | undefined =>
    byCategory.get(categoryForEventType(type));

  for (const row of byTiming) {
    const entry = bucket(row.eventType);
    if (!entry) continue;
    const n = row._count._all;
    entry.events += n;
    switch (row.timingStatus) {
      case "VERIFIED":
      case "SCHEDULED":
        entry.trustedTiming += n;
        break;
      case "DATE_ONLY":
        entry.dateOnly += n;
        break;
      case "REFERENCE_PERIOD_ONLY":
        entry.referencePeriodOnly += n;
        break;
      default:
        entry.untrustedTiming += n;
    }
  }

  for (const row of byConsensus) {
    const entry = bucket(row.event_type);
    if (!entry) continue;
    if (row.consensus_status === "VERIFIED") entry.consensusVerified += row.n;
    else if (row.consensus_status === "UNVERIFIED")
      entry.consensusUnverified += row.n;
    else entry.consensusMissing += row.n;
  }

  for (const row of measured) {
    const entry = bucket(row.event_type);
    if (entry) entry.measuredEvents += row.n;
  }

  const categories = [...byCategory.values()].sort((a, b) => b.events - a.events);
  const totals = categories.reduce<Omit<CategoryCoverage, "category">>(
    (acc, c) => ({
      events: acc.events + c.events,
      trustedTiming: acc.trustedTiming + c.trustedTiming,
      dateOnly: acc.dateOnly + c.dateOnly,
      referencePeriodOnly: acc.referencePeriodOnly + c.referencePeriodOnly,
      untrustedTiming: acc.untrustedTiming + c.untrustedTiming,
      consensusVerified: acc.consensusVerified + c.consensusVerified,
      consensusUnverified: acc.consensusUnverified + c.consensusUnverified,
      consensusMissing: acc.consensusMissing + c.consensusMissing,
      measuredEvents: acc.measuredEvents + c.measuredEvents,
    }),
    {
      events: 0,
      trustedTiming: 0,
      dateOnly: 0,
      referencePeriodOnly: 0,
      untrustedTiming: 0,
      consensusVerified: 0,
      consensusUnverified: 0,
      consensusMissing: 0,
      measuredEvents: 0,
    },
  );

  return { categories, totals };
}

/**
 * Headline library figures for the landing page.
 *
 * Every number is a count or an extreme of a real column. Nothing here is a
 * target, a projection or a round number chosen because it reads well.
 */
export interface LibrarySummary {
  events: number;
  measuredEvents: number;
  instruments: number;
  categories: number;
  earliest: string | null;
  latest: string | null;
}

export async function getLibrarySummary(): Promise<LibrarySummary> {
  const [events, span, instruments, measured, categories] = await Promise.all([
    prisma.event.count(),
    prisma.event.aggregate({
      _min: { occurredAt: true },
      _max: { occurredAt: true },
    }),
    prisma.assetReaction.findMany({
      distinct: ["assetSymbol"],
      select: { assetSymbol: true },
    }),
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT e.id)::int AS n
      FROM events e
      JOIN asset_reactions ar ON ar.event_id = e.id
      WHERE ar.calculation_version = ${CURRENT_REACTION_CALCULATION_VERSION}
        AND ar.pct_change_1d IS NOT NULL
        AND e.timing_status IN ('VERIFIED', 'SCHEDULED')
        AND e.release_at IS NOT NULL
        AND NULLIF(BTRIM(e.timing_source), '') IS NOT NULL
    `),
    prisma.event.groupBy({ by: ["eventType"], _count: { _all: true } }),
  ]);

  const distinctCategories = new Set(
    categories.map((row) => categoryForEventType(row.eventType)),
  );

  return {
    events,
    measuredEvents: measured[0]?.n ?? 0,
    instruments: instruments.length,
    categories: distinctCategories.size,
    earliest: span._min.occurredAt?.toISOString() ?? null,
    latest: span._max.occurredAt?.toISOString() ?? null,
  };
}

/**
 * The event with the largest measured one-session move in the library.
 *
 * Used as the landing page's hero panel, so that the first thing a visitor sees
 * is a real record rather than an illustration. Returns null when nothing in
 * the library is priced yet, and the caller is expected to render something
 * honest instead — inventing a plausible event for the marketing page is how a
 * fabricated number ends up screenshotted as a product claim.
 */
export async function getFeaturedEvent(): Promise<NewsEvent | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT e.id
    FROM events e
    JOIN asset_reactions ar ON ar.event_id = e.id
    WHERE ar.calculation_version = ${CURRENT_REACTION_CALCULATION_VERSION}
      AND ar.pct_change_1d IS NOT NULL
      AND ABS(ar.pct_change_1d) < 'Infinity'::double precision
      AND e.timing_status IN ('VERIFIED', 'SCHEDULED')
      AND e.release_at IS NOT NULL
      AND NULLIF(BTRIM(e.timing_source), '') IS NOT NULL
    GROUP BY e.id, e.release_at
    ORDER BY MAX(ABS(ar.pct_change_1d)) DESC, e.release_at DESC, e.id ASC
    LIMIT 1
  `);
  const id = rows[0]?.id;
  return id === undefined ? null : getEventById(id);
}
