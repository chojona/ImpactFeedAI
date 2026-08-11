/**
 * Event reads against Postgres.
 *
 * This is the layer that replaced `src/lib/mock-data/`. The query-parameter
 * contract (`type`, `q`, `sort`, `offset`, `limit`) and the response envelope
 * (`{ events, total, offset, limit, counts }`) are unchanged, so `EventBrowser`
 * did not have to move with it.
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
 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  FILTERABLE_CATEGORIES,
  eventTypesForCategory,
} from "@/lib/eventCategories";
import { mapEvent, type EventRow } from "@/services/events/mapEvent";
import { CURRENT_REACTION_CALCULATION_VERSION } from "@/services/events/timing";
import type {
  CategoryParam,
  EventListQuery,
} from "@/services/events/queryParams";
import type { EventCategory, EventTypeName, NewsEvent } from "@/types/events";

export interface EventListResult {
  events: NewsEvent[];
  total: number;
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
  where: Prisma.EventWhereInput,
  offset: number,
  limit: number,
): Promise<string[]> {
  const matching = await prisma.event.findMany({
    where,
    select: { id: true },
  });
  if (matching.length === 0) return [];
  const ids = matching.map((e) => e.id);

  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT e.id
    FROM events e
    LEFT JOIN asset_reactions ar
      ON ar.event_id = e.id
      AND ar.calculation_version = ${CURRENT_REACTION_CALCULATION_VERSION}
      AND e.timing_status IN ('VERIFIED', 'SCHEDULED')
      AND e.release_at IS NOT NULL
      AND NULLIF(BTRIM(e.timing_source), '') IS NOT NULL
      AND ABS(ar.pct_change_1d) < 'Infinity'::double precision
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

/* ────────────────────────────── public API ───────────────────────────── */

export async function listEvents(
  query: EventListQuery,
): Promise<EventListResult> {
  const where: Prisma.EventWhereInput = {
    ...categoryFilter(query.category),
    ...searchFilter(query.search),
  };

  const counts = await categoryCounts(query.search);
  const total = counts[query.category] ?? 0;

  let events: NewsEvent[];
  if (query.sort === "biggest") {
    const ids = await idsByBiggestMove(where, query.offset, query.limit);
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

/**
 * Every event in a category, for the pattern aggregates. Bounded by `take`
 * because the aggregation happens in memory — `analyzeCategory` needs each
 * event's reactions, not just a count.
 */
export async function listEventsForCategory(
  category: EventCategory,
  take = 500,
): Promise<NewsEvent[]> {
  const rows = await prisma.event.findMany({
    where: categoryFilter(category),
    orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
    take,
    include: EVENT_INCLUDE,
  });
  return rows.map((r) => mapEvent(r as EventRow));
}

/** Total row count, used to distinguish "no data yet" from "no matches". */
export async function countAllEvents(): Promise<number> {
  return prisma.event.count();
}
