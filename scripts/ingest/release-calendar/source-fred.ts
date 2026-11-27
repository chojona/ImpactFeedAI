/**
 * FRED release dates — reconciliation evidence only.
 *
 * FRED is a mirror, not the publisher: `fred/release/dates` lists the days on
 * which FRED recorded a release (date only). It is used to cross-check the
 * official calendar (missing documents, shutdown shifts, extra revision days),
 * never to create or upgrade a timing record.
 */

import type { ReleaseCalendarRecord, ReleaseFamily } from "@/services/macro/release-calendar-records";

export const FRED_RELEASE_IDS: Partial<Record<ReleaseFamily, number>> = {
  BLS_CPI: 10,
  BLS_PPI: 46,
  BLS_EMPLOYMENT_SITUATION: 50,
  BEA_GDP: 53,
  BEA_PERSONAL_INCOME_OUTLAYS: 54,
};

export const fredReleaseDatesUrl = (releaseId: number, apiKey: string): string =>
  "https://api.stlouisfed.org/fred/release/dates?" + new URLSearchParams({
    release_id: String(releaseId),
    api_key: apiKey,
    file_type: "json",
    realtime_start: "1776-07-04",
    include_release_dates_with_no_data: "false",
    sort_order: "asc",
    limit: "10000",
  }).toString();

export function parseFredReleaseDates(json: string): string[] {
  const parsed = JSON.parse(json) as { release_dates?: { date?: unknown }[]; error_message?: string };
  if (!Array.isArray(parsed.release_dates)) {
    throw new Error(`FRED release/dates: ${parsed.error_message ?? "unexpected payload"}`);
  }
  return parsed.release_dates
    .map((d) => d.date)
    .filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
}

export interface FamilyReconciliation {
  readonly family: ReleaseFamily;
  readonly fredReleaseId: number;
  /** Official-record window, capped at FRED's last date; days outside it are not judged. */
  readonly window: { from: string; to: string } | null;
  readonly officialCount: number;
  readonly fredCountInWindow: number;
  readonly matched: number;
  /** Official release days FRED does not list. */
  readonly officialOnly: string[];
  /** FRED days with no official record — missing documents, or FRED-side revision days. */
  readonly fredOnly: string[];
}

/** Pure, order-independent comparison of official record days vs FRED days. */
export function reconcileWithFred(
  family: ReleaseFamily,
  records: readonly ReleaseCalendarRecord[],
  fredDates: readonly string[],
): FamilyReconciliation {
  const fredReleaseId = FRED_RELEASE_IDS[family];
  if (fredReleaseId === undefined) throw new Error(`no FRED release id for ${family}`);
  const official = [...new Set(
    records
      .filter((r) => r.family === family && r.timingStatus !== "SECONDARY_ONLY")
      .map((r) => r.releaseDate),
  )].sort();
  if (official.length === 0) {
    return { family, fredReleaseId, window: null, officialCount: 0, fredCountInWindow: 0, matched: 0, officialOnly: [], fredOnly: [] };
  }
  // FRED lists past releases only, so future scheduled days are outside the window.
  const lastFred = fredDates.length ? fredDates[fredDates.length - 1] : official[0];
  const lastOfficial = official[official.length - 1];
  const window = { from: official[0], to: lastOfficial < lastFred ? lastOfficial : lastFred };
  official.splice(0, official.length, ...official.filter((d) => d <= window.to));
  const fredIn = new Set(fredDates.filter((d) => d >= window.from && d <= window.to));
  const officialSet = new Set(official);
  return {
    family,
    fredReleaseId,
    window,
    officialCount: official.length,
    fredCountInWindow: fredIn.size,
    matched: official.filter((d) => fredIn.has(d)).length,
    officialOnly: official.filter((d) => !fredIn.has(d)),
    fredOnly: [...fredIn].filter((d) => !officialSet.has(d)).sort(),
  };
}
