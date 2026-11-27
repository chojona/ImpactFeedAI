/**
 * Conservative availability helpers for daily market series.
 *
 * Exact publication clocks are usually unknown for Cboe CSV, Treasury XML and
 * FRED daily market series. We never treat observation-date midnight as a
 * verified release timestamp. Instead we set:
 * - observationAt = UTC midnight of the observation calendar date (session day
 *   label only — not a clock claim)
 * - availableAt = UTC midnight of the next calendar day (conservative lower
 *   bound: the print is not assumed usable on the observation date itself)
 * - availabilityPrecision = "date"
 * - quality = "conservative_date_bound" (or "missing" when value is null)
 */

import type { MarketObservationQuality } from "@/types/context";
import type { AvailabilityPrecision } from "@/services/market-context/types";

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

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
  // Reject impossible calendar dates via UTC round-trip.
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

/** UTC midnight for a validated `YYYY-MM-DD` observation calendar date. */
export function observationAtFromIsoDate(isoDate: string): Date | null {
  const parts = parseIsoDateOnly(isoDate);
  if (!parts) return null;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

/**
 * Conservative earliest usable instant: start of the next UTC calendar day.
 * Documented as date-precision only — not an observed wall-clock.
 */
export function conservativeAvailableAtFromIsoDate(isoDate: string): Date | null {
  const parts = parseIsoDateOnly(isoDate);
  if (!parts) return null;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
}

export function qualityForParsedValue(
  value: number | null,
): MarketObservationQuality {
  if (value === null) return "missing";
  return "conservative_date_bound";
}

export const DATE_AVAILABILITY_PRECISION: AvailabilityPrecision = "date";

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
