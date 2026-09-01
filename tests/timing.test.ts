import { describe, expect, it } from "vitest";

import {
  CURRENT_REACTION_CALCULATION_VERSION,
  eventDateGroup,
  eventWhenDisplay,
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
import type {
  EventTimingStatus,
  EventTimingView,
  ReactionTimingIneligibility,
} from "@/types/events";

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

/**
 * Every level of the "when" ladder, because the feed used to have only four of
 * them and collapsed the missing one — a known occurrence date — into "No
 * release date". Thirty of the fifty events in the library sit on exactly that
 * level, so the gap was the majority state, not an edge case.
 */
describe("eventWhenDisplay", () => {
  const timing = (over: Partial<EventTimingView> = {}): EventTimingView => ({
    status: "UNVERIFIED",
    releaseAt: null,
    releaseDate: null,
    source: null,
    reactionEligible: false,
    ineligibilityReason: "untrusted_status" as ReactionTimingIneligibility,
    ...over,
  });

  const event = (
    overTiming: Partial<EventTimingView> = {},
    occurredAt = "2024-10-29T20:00:00.000Z",
    referencePeriodStart: string | null = null,
  ) => ({
    timing: timing(overTiming),
    occurredAt,
    releases: [{ referencePeriodStart }],
  });

  it("uses a sourced release instant, and says the timing is verified", () => {
    const when = eventWhenDisplay(
      event({
        status: "SCHEDULED",
        releaseAt: "2025-05-13T12:30:00.000Z",
        releaseDate: "2025-05-13",
        source: "BLS release schedule",
        reactionEligible: true,
        ineligibilityReason: null,
      }),
    );
    expect(when.precision).toBe("release_instant");
    expect(when.text).toBe("May 13, 2025");
    expect(when.dateTime).toBe("2025-05-13T12:30:00.000Z");
    // The instant is the machine value; the day is the bucket it groups into.
    expect(when.day).toBe("2025-05-13");
    expect(when.dateKnown).toBe(true);
    expect(when.label).toBe("Verified timing");
    expect(when.tone).toBe("trusted");
  });

  it("falls back to a publication date and does not claim a time", () => {
    const when = eventWhenDisplay(
      event({
        status: "DATE_ONLY",
        releaseDate: "2025-05-13",
        ineligibilityReason: "untrusted_status",
      }),
    );
    expect(when.precision).toBe("release_date");
    expect(when.text).toBe("May 13, 2025");
    // A day, not an instant: no clock time is asserted anywhere.
    expect(when.dateTime).toBe("2025-05-13");
    expect(when.day).toBe("2025-05-13");
    expect(when.dateKnown).toBe(true);
    expect(when.label).toBe("Release date only");
    expect(when.tone).toBe("caution");
  });

  it("falls back to the occurrence date instead of claiming no date exists", () => {
    const when = eventWhenDisplay(event());
    expect(when.precision).toBe("event_date");
    expect(when.text).toBe("Oct 29, 2024");
    expect(when.day).toBe("2024-10-29");
    expect(when.dateKnown).toBe(true);
    expect(when.tone).toBe("caution");
  });

  it("labels the occurrence date as an event date with unverified timing", () => {
    const when = eventWhenDisplay(event());
    expect(when.label).toBe("Event date · time unverified");
    expect(when.explanation).toContain("no release time has been verified");
    expect(when.explanation).not.toContain("verified release");
  });

  /**
   * The whole risk of this fallback in one assertion. `occurredAt` is stored as
   * an instant whose time is not verified against anything; emitting it as a
   * machine-readable instant would hand a consumer the precision the label in
   * the same breath denies.
   */
  it("never re-publishes an unverified occurrence instant at instant precision", () => {
    const when = eventWhenDisplay(event());
    expect(when.dateTime).toBe("2024-10-29");
    expect(when.dateTime).not.toContain("T");
    expect(when.text).not.toMatch(/\d:\d\d/);
  });

  it("reduces the occurrence instant to its US Eastern day", () => {
    // 02:00Z on Jun 11 is 22:00 ET on Jun 10 — the market day the rest of the
    // app formats in, and the same day `formatNewYorkDate` already reports.
    const when = eventWhenDisplay(event({}, "2025-06-11T02:00:00.000Z"));
    expect(when.text).toBe("Jun 10, 2025");
    expect(when.dateTime).toBe("2025-06-10");
  });

  it("prefers a known event date over the statistic's reference period", () => {
    const when = eventWhenDisplay(event({}, "2024-10-29T20:00:00.000Z", "2024-09-01"));
    expect(when.precision).toBe("event_date");
  });

  it("falls back to a reference period when no date is recoverable", () => {
    const when = eventWhenDisplay(event({}, "not-an-instant", "2025-04-01"));
    expect(when.precision).toBe("reference_period");
    expect(when.text).toBe("Ref Apr 2025");
    expect(when.dateTime).toBeNull();
    expect(when.day).toBeNull();
    expect(when.dateKnown).toBe(false);
  });

  it("states a genuinely unknown date as an absence, not as a date", () => {
    const when = eventWhenDisplay(event({}, "not-an-instant", null));
    expect(when.precision).toBe("unknown");
    expect(when.text).toBe("No date recorded");
    expect(when.dateTime).toBeNull();
    expect(when.day).toBeNull();
    expect(when.dateKnown).toBe(false);
    expect(when.tone).toBe("caution");
  });

  it("keeps an instant with incomplete provenance out of the verified voice", () => {
    const when = eventWhenDisplay(
      event({
        status: "VERIFIED",
        releaseAt: "2025-05-13T12:30:00.000Z",
        source: null,
        ineligibilityReason: "missing_timing_source",
      }),
    );
    expect(when.precision).toBe("release_instant");
    expect(when.label).toBe("Timing provenance incomplete");
    expect(when.tone).toBe("caution");
  });

  it("gives each precision level a distinct label", () => {
    const labels = [
      eventWhenDisplay(
        event({
          status: "SCHEDULED",
          releaseAt: "2025-05-13T12:30:00.000Z",
          source: "BLS release schedule",
          reactionEligible: true,
          ineligibilityReason: null,
        }),
      ).label,
      eventWhenDisplay(event({ status: "DATE_ONLY", releaseDate: "2025-05-13" }))
        .label,
      eventWhenDisplay(event()).label,
    ];
    expect(new Set(labels).size).toBe(labels.length);
  });
});

/**
 * Calendar sections for the chronological feed. The input is always the `day`
 * off the ladder above, never a raw column, so a heading cannot claim a date
 * the card itself does not show.
 */
describe("eventDateGroup", () => {
  // Noon ET on Sep 1 2026.
  const now = new Date("2026-09-01T16:00:00.000Z");

  it("names the current and previous US-Eastern day", () => {
    expect(eventDateGroup("2026-09-01", now).label).toBe("Today");
    expect(eventDateGroup("2026-08-31", now).label).toBe("Yesterday");
  });

  it("collapses everything older into its month", () => {
    expect(eventDateGroup("2026-08-30", now)).toEqual({
      key: "2026-08",
      label: "Aug 2026",
    });
    expect(eventDateGroup("2024-10-29", now)).toEqual({
      key: "2024-10",
      label: "Oct 2024",
    });
  });

  it("groups a future-dated row by month rather than calling it today", () => {
    expect(eventDateGroup("2026-09-30", now).label).toBe("Sep 2026");
  });

  it("gives an undated row a section of its own", () => {
    expect(eventDateGroup(null, now)).toEqual({
      key: "no-date",
      label: "Date not recorded",
    });
  });

  it("reads the current day in US-Eastern, not UTC", () => {
    // 01:00Z on Sep 2 is still 21:00 ET on Sep 1.
    const lateUtc = new Date("2026-09-02T01:00:00.000Z");
    expect(eventDateGroup("2026-09-01", lateUtc).label).toBe("Today");
    expect(eventDateGroup("2026-08-31", lateUtc).label).toBe("Yesterday");
  });

  /**
   * "Yesterday" is one calendar day back, not 24 hours back. On the 25-hour
   * November day the two disagree, and subtracting a fixed interval would file
   * the previous day's events under "Today".
   */
  it("steps back one calendar day across a DST boundary", () => {
    // Nov 3 2024 23:30 ET, the day the clocks went back.
    const afterFallBack = new Date("2024-11-04T04:30:00.000Z");
    expect(eventDateGroup("2024-11-03", afterFallBack).label).toBe("Today");
    expect(eventDateGroup("2024-11-02", afterFallBack).label).toBe("Yesterday");
  });

  it("steps back across a month and a year boundary", () => {
    const firstOfMonth = new Date("2026-03-01T17:00:00.000Z");
    expect(eventDateGroup("2026-02-28", firstOfMonth).label).toBe("Yesterday");
    const newYear = new Date("2026-01-01T17:00:00.000Z");
    expect(eventDateGroup("2025-12-31", newYear).label).toBe("Yesterday");
  });

  it("keys recent days by day and older rows by month, so nothing merges", () => {
    expect(eventDateGroup("2026-09-01", now).key).toBe("2026-09-01");
    expect(eventDateGroup("2026-07-04", now).key).toBe("2026-07");
  });
});
