/**
 * Pure calendar presentation helpers for the personal terminal.
 *
 * Kept out of the React tree so "Measured" and chronological order have one
 * definition and can be regression-tested without rendering. The effective
 * instant here must stay aligned with the COALESCE expression in
 * `listCalendarEvents` — that query ranks *before* LIMIT so a take of 200
 * cannot drop the newest rows.
 */
import type { NewsEvent } from "@/types/events";

/** Default page size for the research calendar agenda. */
export const DEFAULT_CALENDAR_TAKE = 200;

/**
 * True only when the event is timing-eligible and carries at least one
 * current-version headline (`RELEASE_SESSION`) measurement.
 *
 * `assets.length > 0` is not enough: the mapper can attach asset shells for
 * non-headline measures, or for unusable rows that leave `percentChange` null.
 */
export function eventHasMeasuredReaction(event: NewsEvent): boolean {
  if (!event.timing.reactionEligible) return false;
  return event.assets.some(
    (asset) =>
      asset.headlineMeasure !== null &&
      asset.percentChange !== null &&
      Number.isFinite(asset.percentChange),
  );
}

/** Minimal fields needed to rank a calendar candidate before hydration. */
export interface CalendarSortCandidate {
  id: string;
  /** ISO 8601 UTC instant, or null. */
  releaseAt: string | null;
  /** YYYY-MM-DD publication date, or null. */
  releaseDate: string | null;
  /** ISO 8601 UTC occurrence instant. */
  occurredAt: string;
}

/**
 * Effective display instant from the same field precedence the SQL COALESCE uses.
 *
 * `releaseAt`, then `releaseDate` at UTC noon (never midnight), then
 * `occurredAt`. Undated / unparseable inputs return null and sort last.
 */
export function effectiveCalendarInstantFromFields(
  fields: Omit<CalendarSortCandidate, "id">,
): Date | null {
  if (fields.releaseAt !== null) {
    const instant = new Date(fields.releaseAt);
    if (Number.isFinite(instant.getTime())) return instant;
  }

  if (fields.releaseDate !== null && /^\d{4}-\d{2}-\d{2}$/.test(fields.releaseDate)) {
    // Noon UTC: a date-only value must not sort as an invented midnight instant.
    const day = new Date(`${fields.releaseDate}T12:00:00.000Z`);
    if (Number.isFinite(day.getTime())) return day;
  }

  const occurred = new Date(fields.occurredAt);
  if (Number.isFinite(occurred.getTime())) return occurred;

  return null;
}

/**
 * Effective display instant for calendar ordering.
 *
 * Mirrors `eventWhenDisplay` precedence: `releaseAt`, then `releaseDate`
 * (date-only → UTC noon so it does not invent a midnight release), then
 * `occurredAt`. Reference-period-only / unknown rows return null and sort last.
 */
export function effectiveCalendarInstant(event: NewsEvent): Date | null {
  return effectiveCalendarInstantFromFields({
    releaseAt: event.timing.releaseAt,
    releaseDate: event.timing.releaseDate,
    occurredAt: event.occurredAt,
  });
}

/**
 * Newest effective display time first; undated rows last; stable `id` tie-break.
 */
export function compareCalendarEvents(a: NewsEvent, b: NewsEvent): number {
  return compareCalendarCandidates(
    {
      id: a.id,
      releaseAt: a.timing.releaseAt,
      releaseDate: a.timing.releaseDate,
      occurredAt: a.occurredAt,
    },
    {
      id: b.id,
      releaseAt: b.timing.releaseAt,
      releaseDate: b.timing.releaseDate,
      occurredAt: b.occurredAt,
    },
  );
}

export function compareCalendarCandidates(
  a: CalendarSortCandidate,
  b: CalendarSortCandidate,
): number {
  const aAt = effectiveCalendarInstantFromFields(a)?.getTime() ?? null;
  const bAt = effectiveCalendarInstantFromFields(b)?.getTime() ?? null;
  if (aAt === null && bAt === null) return a.id.localeCompare(b.id);
  if (aAt === null) return 1;
  if (bAt === null) return -1;
  if (aAt !== bAt) return bAt - aAt;
  return a.id.localeCompare(b.id);
}

export function sortCalendarEvents(
  events: readonly NewsEvent[],
): NewsEvent[] {
  return [...events].sort(compareCalendarEvents);
}

/**
 * Top `take` ids by effective calendar instant — the same ranking the SQL
 * LIMIT must apply *before* hydration. Used by regression tests that build
 * more than {@link DEFAULT_CALENDAR_TAKE} mixed-date candidates without a DB.
 */
export function selectTopCalendarIds(
  candidates: readonly CalendarSortCandidate[],
  take: number,
): string[] {
  if (take <= 0) return [];
  return [...candidates]
    .sort(compareCalendarCandidates)
    .slice(0, take)
    .map((row) => row.id);
}
