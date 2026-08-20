import { describe, expect, it } from "vitest";

import {
  CURRENT_REACTION_CALCULATION_VERSION,
  formatNewYorkDate,
  formatNewYorkDateTime,
  formatPlainDate,
  formatReferencePeriod,
  isReactionTimingEligible,
  REACTION_ELIGIBLE_TIMING_STATUSES,
  reactionTimingIneligibilityExplanation,
  reactionTimingEligibility,
  timingStatusExplanation,
  timingStatusLabel,
} from "@/services/events/timing";
import type { EventTimingStatus } from "@/types/events";

const exactTiming = {
  releaseAt: new Date("2025-05-13T12:30:00Z"),
  timingSource: "Official release calendar",
};

describe("reactionTimingEligibility", () => {
  it.each(["VERIFIED", "SCHEDULED"] as const)(
    "accepts %s timing with an exact instant and named source",
    (timingStatus) => {
      expect(
        reactionTimingEligibility({ ...exactTiming, timingStatus }),
      ).toEqual({ eligible: true, reason: null });
    },
  );

  it.each([
    "INFERRED",
    "DATE_ONLY",
    "REFERENCE_PERIOD_ONLY",
    "UNVERIFIED",
  ] as const)("rejects %s timing", (timingStatus) => {
    expect(
      reactionTimingEligibility({ ...exactTiming, timingStatus }),
    ).toEqual({ eligible: false, reason: "untrusted_status" });
  });

  it("rejects absent and invalid release instants", () => {
    expect(
      reactionTimingEligibility({
        ...exactTiming,
        releaseAt: null,
        timingStatus: "VERIFIED",
      }),
    ).toEqual({ eligible: false, reason: "missing_release_timestamp" });
    expect(
      reactionTimingEligibility({
        ...exactTiming,
        releaseAt: new Date(Number.NaN),
        timingStatus: "VERIFIED",
      }),
    ).toEqual({ eligible: false, reason: "missing_release_timestamp" });
  });

  it.each([null, "", "   "])("rejects unnamed timing source %j", (source) => {
    expect(
      reactionTimingEligibility({
        ...exactTiming,
        timingStatus: "VERIFIED",
        timingSource: source,
      }),
    ).toEqual({ eligible: false, reason: "missing_timing_source" });
  });
});

describe("timing presentation", () => {
  it("formats winter and summer instants in America/New_York", () => {
    expect(formatNewYorkDateTime("2025-01-15T13:30:00.000Z")).toContain(
      "8:30 AM EST",
    );
    expect(formatNewYorkDateTime("2025-06-11T12:30:00.000Z")).toContain(
      "8:30 AM EDT",
    );
    expect(formatNewYorkDate("2025-06-11T02:00:00.000Z")).toBe(
      "Jun 10, 2025",
    );
  });

  it("formats SQL dates without applying a timezone shift", () => {
    expect(formatPlainDate("2025-05-13")).toBe("May 13, 2025");
    expect(formatReferencePeriod("2025-04-01")).toBe("Apr 2025");
    expect(formatPlainDate("2025-02-31")).toBeNull();
    expect(formatPlainDate("not-a-date")).toBeNull();
  });

  it("returns null for missing or malformed instants", () => {
    expect(formatNewYorkDateTime(null)).toBeNull();
    expect(formatNewYorkDateTime("not-an-instant")).toBeNull();
  });

  it("gives every timing status a reader-facing label and explanation", () => {
    const statuses: EventTimingStatus[] = [
      "VERIFIED",
      "SCHEDULED",
      "INFERRED",
      "DATE_ONLY",
      "REFERENCE_PERIOD_ONLY",
      "UNVERIFIED",
    ];
    for (const status of statuses) {
      expect(timingStatusLabel(status).length).toBeGreaterThan(0);
      expect(timingStatusExplanation(status).length).toBeGreaterThan(0);
    }
  });

  it("explains every suppression reason without claiming it is verified", () => {
    expect(reactionTimingIneligibilityExplanation("untrusted_status")).toContain(
      "not verified",
    );
    expect(
      reactionTimingIneligibilityExplanation("missing_release_timestamp"),
    ).toContain("No valid exact release instant");
    expect(
      reactionTimingIneligibilityExplanation("missing_timing_source"),
    ).toContain("no named timing source");
  });

  it("pins the version gate to the current calculation contract", () => {
    expect(CURRENT_REACTION_CALCULATION_VERSION).toBe(2);
  });

  /**
   * The query layer prefilters on `REACTION_ELIGIBLE_TIMING_STATUSES` in SQL
   * while every read path re-checks `reactionTimingEligibility` in JavaScript.
   * If the two disagree the failure is silent: a prefilter that admits one
   * extra status yields rows indistinguishable from eligible ones, and one that
   * admits too few makes eligible events vanish with no error anywhere.
   */
  it("keeps the SQL prefilter and the eligibility predicate in agreement", () => {
    const allStatuses: EventTimingStatus[] = [
      "VERIFIED",
      "SCHEDULED",
      "INFERRED",
      "DATE_ONLY",
      "REFERENCE_PERIOD_ONLY",
      "UNVERIFIED",
    ];

    for (const status of allStatuses) {
      const prefilterAdmits = (
        REACTION_ELIGIBLE_TIMING_STATUSES as readonly EventTimingStatus[]
      ).includes(status);
      const predicateAdmits = isReactionTimingEligible({
        releaseAt: new Date("2025-05-13T12:30:00.000Z"),
        timingStatus: status,
        timingSource: "BLS release schedule",
      });
      expect(predicateAdmits).toBe(prefilterAdmits);
    }
  });

  it("still fails closed on provenance the status alone cannot supply", () => {
    // Passing the status prefilter is necessary, never sufficient — the
    // instant and its source are checked independently.
    for (const status of REACTION_ELIGIBLE_TIMING_STATUSES) {
      expect(
        isReactionTimingEligible({
          releaseAt: null,
          timingStatus: status,
          timingSource: "BLS release schedule",
        }),
      ).toBe(false);
      expect(
        isReactionTimingEligible({
          releaseAt: new Date("2025-05-13T12:30:00.000Z"),
          timingStatus: status,
          timingSource: "   ",
        }),
      ).toBe(false);
    }
  });
});
