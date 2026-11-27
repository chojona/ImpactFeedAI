/**
 * Session-calendar helpers for PR #16 feature consumers.
 *
 * VIX trailing percentile and equity RV20 require an independently validated
 * ascending unique `sessionCalendar`. Observation presence alone must not
 * invent that calendar — listing only dates that have prints compresses gaps.
 *
 * Typical source: `buildSessionCalendar` from `services/market/sessionCalendar`
 * (SPY daily bars). These helpers only validate / project — they never fill
 * missing sessions.
 */

import { parseIsoDateOnly } from "@/services/market-context/availability";
import type { MarketContextObservation } from "@/types/context";

export type SessionCalendarValidation =
  | { readonly ok: true; readonly sessionCalendar: readonly string[] }
  | {
      readonly ok: false;
      readonly reason: "empty" | "invalid_date" | "not_unique" | "not_ascending";
      readonly detail: string;
    };

/**
 * Validate an independently sourced session calendar for FeatureComputeRequest.
 * Does not invent or interpolate missing sessions.
 */
export function validateSessionCalendar(
  dates: readonly string[],
): SessionCalendarValidation {
  if (dates.length === 0) {
    return { ok: false, reason: "empty", detail: "sessionCalendar is empty" };
  }

  const seen = new Set<string>();
  for (let i = 0; i < dates.length; i++) {
    const day = dates[i]!;
    if (!parseIsoDateOnly(day)) {
      return {
        ok: false,
        reason: "invalid_date",
        detail: `invalid session date at index ${i}: ${day}`,
      };
    }
    if (seen.has(day)) {
      return {
        ok: false,
        reason: "not_unique",
        detail: `duplicate session date: ${day}`,
      };
    }
    seen.add(day);
    if (i > 0 && day <= dates[i - 1]!) {
      return {
        ok: false,
        reason: "not_ascending",
        detail: `sessionCalendar must be strictly ascending (${dates[i - 1]} then ${day})`,
      };
    }
  }

  return { ok: true, sessionCalendar: dates };
}

/**
 * Observation dates that appear on an independently validated calendar.
 * Missing calendar sessions are preserved as gaps (not dropped from the
 * calendar); this only filters observation rows.
 */
export function observationDatesOnSessionCalendar(
  observations: readonly MarketContextObservation[],
  sessionCalendar: readonly string[],
): readonly string[] {
  const onCalendar = new Set(sessionCalendar);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const obs of observations) {
    if (!onCalendar.has(obs.observationDate)) continue;
    if (seen.has(obs.observationDate)) continue;
    seen.add(obs.observationDate);
    out.push(obs.observationDate);
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

/**
 * True when every calendar day in `[endIdx - count + 1, endIdx]` has a finite
 * observation for `seriesKey`. Used by callers preparing PR #16 windows —
 * incomplete calendars stay incomplete (no compression).
 */
export function sessionWindowIsComplete(
  observations: readonly MarketContextObservation[],
  seriesKey: string,
  sessionCalendar: readonly string[],
  endDate: string,
  sessionCount: number,
): boolean {
  const validated = validateSessionCalendar(sessionCalendar);
  if (!validated.ok) return false;
  if (sessionCount <= 0) return false;

  const endIdx = sessionCalendar.indexOf(endDate);
  if (endIdx < 0 || endIdx + 1 < sessionCount) return false;

  const byDate = new Map<string, MarketContextObservation>();
  for (const obs of observations) {
    if (obs.seriesKey !== seriesKey) continue;
    if (obs.value === null || !Number.isFinite(obs.value)) continue;
    if (obs.quality === "conflict" || obs.quality === "missing") continue;
    // Last-write for same date is fine here; PR #16 quarantines duplicates at
    // feature PIT. Adapters should not emit conflicting same-date rows.
    byDate.set(obs.observationDate, obs);
  }

  const window = sessionCalendar.slice(endIdx - sessionCount + 1, endIdx + 1);
  return window.every((day) => byDate.has(day));
}
