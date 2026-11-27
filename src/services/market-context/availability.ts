/**
 * Provider-specific availability policies for daily market series.
 *
 * Never treat observation-date UTC midnight as a verified publication clock.
 * Policies use America/New_York wall times via {@link easternWallClock}, matching
 * Agent 03's NY-calendar approach for day-bound evidence.
 *
 * Policy versions (do not silently change semantics — bump the id):
 * - `cboe-vix-ny-next-day-open-v1`: free Cboe daily CSV has no verified CDN
 *   refresh clock; earliest defensible use is next NY calendar day 00:00.
 * - `treasury-h15-1615-et-v1`: Board H.15 Selected Interest Rates posts at
 *   16:15 ET; use that schedule as the conservative public bound for the
 *   Treasury par-yield day (even when the Treasury XML feed updates earlier).
 * - `fred-market-ny-next-day-1000-et-v1`: FRED redistributor lag for market
 *   series (e.g. VIXCLS ~08:38 CST next morning); use next NY day 10:00 ET.
 * - `fred-vintage-ny-eod-v1`: when an ALFRED-style realtime vintage date is
 *   known, use next NY day 00:00 after that vintage date (Agent 03 NY-EOD).
 */

import { easternWallClock, utcDateOnly } from "@/services/macro/time";
import type { MarketObservationQuality } from "@/types/context";
import type { AvailabilityPrecision } from "@/services/market-context/types";

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export const AVAILABILITY_POLICY = {
  CBOE_VIX_NY_NEXT_DAY_OPEN: "cboe-vix-ny-next-day-open-v1",
  TREASURY_H15_1615_ET: "treasury-h15-1615-et-v1",
  FRED_MARKET_NY_NEXT_DAY_1000_ET: "fred-market-ny-next-day-1000-et-v1",
  FRED_VINTAGE_NY_EOD: "fred-vintage-ny-eod-v1",
} as const;

export type AvailabilityPolicyVersion =
  (typeof AVAILABILITY_POLICY)[keyof typeof AVAILABILITY_POLICY];

export interface AvailabilityBound {
  readonly availableAt: Date | null;
  readonly availabilityPrecision: AvailabilityPrecision;
  readonly availabilityPolicyVersion: AvailabilityPolicyVersion | null;
  readonly quality: MarketObservationQuality;
}

export function parseIsoDateOnly(isoDate: string): {
  year: number;
  month: number;
  day: number;
} | null {
  const match = ISO_DAY.exec(isoDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** UTC midnight for a validated `YYYY-MM-DD` observation calendar date (day label). */
export function observationAtFromIsoDate(isoDate: string): Date | null {
  const parts = parseIsoDateOnly(isoDate);
  if (!parts) return null;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function addUtcCalendarDays(isoDay: string, days: number): string | null {
  const base = utcDateOnly(isoDay);
  if (Number.isNaN(base.getTime())) return null;
  const next = new Date(base.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/** Next America/New_York calendar day at 00:00 ET after `isoDay`. */
export function nextNyMidnightAfter(isoDay: string): Date | null {
  const nextDay = addUtcCalendarDays(isoDay, 1);
  if (!nextDay) return null;
  const instant = easternWallClock(nextDay, 0, 0);
  return Number.isFinite(instant.getTime()) ? instant : null;
}

export function cboeVixAvailability(observationDate: string): AvailabilityBound {
  const availableAt = nextNyMidnightAfter(observationDate);
  if (!availableAt) {
    return {
      availableAt: null,
      availabilityPrecision: "unknown",
      availabilityPolicyVersion: null,
      quality: "unknown_availability",
    };
  }
  return {
    availableAt,
    availabilityPrecision: "date",
    availabilityPolicyVersion: AVAILABILITY_POLICY.CBOE_VIX_NY_NEXT_DAY_OPEN,
    quality: "conservative_date_bound",
  };
}

/** H.15 16:15 ET on the observation date (schedule-based timestamp precision). */
export function treasuryH15Availability(observationDate: string): AvailabilityBound {
  if (!parseIsoDateOnly(observationDate)) {
    return {
      availableAt: null,
      availabilityPrecision: "unknown",
      availabilityPolicyVersion: null,
      quality: "unknown_availability",
    };
  }
  const availableAt = easternWallClock(observationDate, 16, 15);
  if (!Number.isFinite(availableAt.getTime())) {
    return {
      availableAt: null,
      availabilityPrecision: "unknown",
      availabilityPolicyVersion: null,
      quality: "unknown_availability",
    };
  }
  return {
    availableAt,
    availabilityPrecision: "timestamp",
    availabilityPolicyVersion: AVAILABILITY_POLICY.TREASURY_H15_1615_ET,
    quality: "conservative_date_bound",
  };
}

/**
 * FRED redistributor bound for market series without a vintage as-of.
 * Uses next NY day 10:00 ET — after typical VIXCLS morning updates (~08:38 CST).
 */
export function fredMarketRedistributorAvailability(
  observationDate: string,
): AvailabilityBound {
  const nextDay = addUtcCalendarDays(observationDate, 1);
  if (!nextDay) {
    return {
      availableAt: null,
      availabilityPrecision: "unknown",
      availabilityPolicyVersion: null,
      quality: "unknown_availability",
    };
  }
  const availableAt = easternWallClock(nextDay, 10, 0);
  if (!Number.isFinite(availableAt.getTime())) {
    return {
      availableAt: null,
      availabilityPrecision: "unknown",
      availabilityPolicyVersion: null,
      quality: "unknown_availability",
    };
  }
  return {
    availableAt,
    availabilityPrecision: "timestamp",
    availabilityPolicyVersion: AVAILABILITY_POLICY.FRED_MARKET_NY_NEXT_DAY_1000_ET,
    quality: "conservative_date_bound",
  };
}

/** ALFRED-style vintage: next NY midnight after the realtime/vintage date. */
export function fredVintageAvailability(vintageDate: string): AvailabilityBound {
  const availableAt = nextNyMidnightAfter(vintageDate);
  if (!availableAt) {
    return {
      availableAt: null,
      availabilityPrecision: "unknown",
      availabilityPolicyVersion: null,
      quality: "unknown_availability",
    };
  }
  return {
    availableAt,
    availabilityPrecision: "date",
    availabilityPolicyVersion: AVAILABILITY_POLICY.FRED_VINTAGE_NY_EOD,
    quality: "conservative_date_bound",
  };
}

/**
 * Current revised FRED observations: unsuitable for historical reconstruction.
 * Do not invent an availableAt that would pass PIT cutoffs.
 */
export function fredRevisedLatestAvailability(): AvailabilityBound {
  return {
    availableAt: null,
    availabilityPrecision: "unknown",
    availabilityPolicyVersion: null,
    quality: "revised_latest",
  };
}

export function qualityForParsedValue(
  value: number | null,
  base: MarketObservationQuality,
): MarketObservationQuality {
  if (value === null) return "missing";
  return base;
}

/**
 * Parse a source numeric field. Empty / `.` / non-finite → null.
 * Never coerces missing to 0.
 */
export function parseRawNumeric(raw: string | null | undefined): {
  value: number | null;
  rawValue: string | null;
  parseStatus: "ok" | "missing" | "invalid";
} {
  if (raw === null || raw === undefined) {
    return { value: null, rawValue: null, parseStatus: "missing" };
  }
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === ".") {
    return { value: null, rawValue: trimmed, parseStatus: "missing" };
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n)) {
    return { value: null, rawValue: trimmed, parseStatus: "invalid" };
  }
  return { value: n, rawValue: trimmed, parseStatus: "ok" };
}

/** Convert M/D/YYYY (Cboe) to YYYY-MM-DD. */
export function mdyToIsoDate(mdy: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(mdy.trim());
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return parseIsoDateOnly(iso) ? iso : null;
}

/** Extract YYYY-MM-DD from Treasury `YYYY-MM-DDTHH:MM:SS` NEW_DATE. */
export function treasuryDateTimeToIsoDate(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  if (!match) return null;
  return parseIsoDateOnly(match[1]) ? match[1] : null;
}
