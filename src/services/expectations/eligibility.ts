import type { ExpectationFixtureRow } from "@/services/expectations/fixtureTypes";
import type { ExpectationObservation } from "@/types/expectations";

/**
 * Point-in-time eligibility against an exact release cutoff.
 *
 * - No cutoff → every row is eligible (caller still filters by kind/metric).
 * - VERIFIED → `asOf < releaseAt` (strict). Equality is post-knowledge.
 * - DATE_ONLY → `asOfDate <` the UTC calendar date of `releaseAt`. Same-day
 *   dates stay ineligible because we refuse to invent a pre-release clock.
 * - MISSING → ineligible when a cutoff exists (timing unproven).
 */
export function isExpectationTimingEligibleAtRelease(
  timing: {
    readonly asOf: Date | null;
    readonly asOfDate: string | null;
    readonly asOfQuality: ExpectationObservation["asOfQuality"];
  },
  releaseAt: Date | null,
): boolean {
  if (!releaseAt) return true;

  if (timing.asOfQuality === "VERIFIED") {
    if (!timing.asOf || Number.isNaN(timing.asOf.getTime())) return false;
    return timing.asOf.getTime() < releaseAt.getTime();
  }

  if (timing.asOfQuality === "DATE_ONLY") {
    if (!timing.asOfDate || !/^\d{4}-\d{2}-\d{2}$/.test(timing.asOfDate)) {
      return false;
    }
    const releaseDay = releaseAt.toISOString().slice(0, 10);
    return timing.asOfDate < releaseDay;
  }

  return false;
}

export function isFixtureRowEligibleAtRelease(
  row: ExpectationFixtureRow,
  releaseAt: Date | null,
): boolean {
  return isExpectationTimingEligibleAtRelease(
    {
      asOf: row.asOf ? new Date(row.asOf) : null,
      asOfDate: row.asOfDate,
      asOfQuality: row.asOfQuality,
    },
    releaseAt,
  );
}
