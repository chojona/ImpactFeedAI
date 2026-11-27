/**
 * Pure calendar presentation helpers for the personal terminal.
 *
 * Kept out of the React tree so "Measured" and chronological order have one
 * definition and can be regression-tested without rendering.
 */
import type { NewsEvent } from "@/types/events";

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

/**
 * Effective display instant for calendar ordering.
 *
 * Mirrors `eventWhenDisplay` precedence: `releaseAt`, then `releaseDate`
 * (date-only → UTC noon so it does not invent a midnight release), then
 * `occurredAt`. Reference-period-only / unknown rows return null and sort last.
 */
export function effectiveCalendarInstant(event: NewsEvent): Date | null {
  const releaseAt = event.timing.releaseAt;
  if (releaseAt !== null) {
    const instant = new Date(releaseAt);
    if (Number.isFinite(instant.getTime())) return instant;
  }

  const releaseDate = event.timing.releaseDate;
  if (releaseDate !== null && /^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
    // Noon UTC: a date-only value must not sort as an invented midnight instant.
    const day = new Date(`${releaseDate}T12:00:00.000Z`);
    if (Number.isFinite(day.getTime())) return day;
  }

  const occurred = new Date(event.occurredAt);
  if (Number.isFinite(occurred.getTime())) return occurred;

  return null;
}

/**
 * Newest effective display time first; undated rows last; stable `id` tie-break.
 */
export function compareCalendarEvents(a: NewsEvent, b: NewsEvent): number {
  const aAt = effectiveCalendarInstant(a)?.getTime() ?? null;
  const bAt = effectiveCalendarInstant(b)?.getTime() ?? null;
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
