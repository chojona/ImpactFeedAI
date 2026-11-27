/**
 * Availability policies for day-level ALFRED evidence.
 *
 * Never invents an 08:30 (or any other) publication instant from a vintage date.
 */

import { easternWallClock, utcDateOnly } from "@/services/macro/time";
import { ALFRED_NY_EOD_AVAILABILITY_POLICY } from "@/services/context/definitions";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function addUtcCalendarDays(isoDay: string, days: number): string {
  const base = utcDateOnly(isoDay);
  if (Number.isNaN(base.getTime())) return "";
  const next = new Date(base.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/**
 * Earliest defensible availability under alfred-ny-eod-v1: the first instant of
 * the next America/New_York calendar day after `publicationDate`.
 *
 * Returns null when the date is invalid. Does not set `publishedAt`.
 */
export function conservativeNyEndOfDayAvailableAt(
  publicationDate: string,
): Date | null {
  if (!ISO_DAY.test(publicationDate)) return null;
  const nextDay = addUtcCalendarDays(publicationDate, 1);
  if (!nextDay) return null;
  const instant = easternWallClock(nextDay, 0, 0);
  return Number.isFinite(instant.getTime()) ? instant : null;
}

export function alfredDateBoundAvailability(publicationDate: string): {
  availableAt: Date | null;
  availabilityQuality: "CONSERVATIVE_DATE_BOUND" | "UNRESOLVED";
  availabilityPolicyVersion: string | null;
  publishedAt: null;
  publicationPrecision: "date" | "unknown";
} {
  const availableAt = conservativeNyEndOfDayAvailableAt(publicationDate);
  if (!availableAt) {
    return {
      availableAt: null,
      availabilityQuality: "UNRESOLVED",
      availabilityPolicyVersion: null,
      publishedAt: null,
      publicationPrecision: "unknown",
    };
  }
  return {
    availableAt,
    availabilityQuality: "CONSERVATIVE_DATE_BOUND",
    availabilityPolicyVersion: ALFRED_NY_EOD_AVAILABILITY_POLICY,
    publishedAt: null,
    publicationPrecision: "date",
  };
}
