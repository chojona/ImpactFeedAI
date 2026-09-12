import { describe, expect, it } from "vitest";

import { checkInvariants } from "../scripts/maintenance/verify-reaction-measurements";

const sessionRow = {
  measure: "RELEASE_SESSION" as const,
  anchorKind: "PRIOR_SESSION_CLOSE" as const,
  anchorPrice: 100,
  anchorBarAt: new Date("2025-07-02T13:30:00Z"),
  anchorSessionDay: "2025-07-02",
  endpointPrice: 102,
  // Yahoo stamps the daily bar at the session OPEN, which is BEFORE a 14:00
  // release. A naive `releaseAt < endpointBarAt` check would fail here.
  endpointBarAt: new Date("2025-07-03T13:30:00Z"),
  endpointSessionDay: "2025-07-03",
  releaseSessionDay: "2025-07-03",
  pctChange: 2,
  priceBasis: "SPLIT_ADJUSTED" as const,
  sessionBasis: "US_EQUITY_RTH" as const,
};

const ctx = {
  releaseAt: new Date("2025-07-03T18:00:00Z"), // 14:00 EDT
  sessionDays: ["2025-07-01", "2025-07-02", "2025-07-03", "2025-07-07"],
};

describe("checkInvariants", () => {
  it("accepts a session row whose endpoint bar stamp precedes the release", () => {
    // The session family is verified by SESSION ORDERING, never by naive
    // timestamp ordering against releaseAt.
    expect(checkInvariants(sessionRow, ctx)).toEqual([]);
  });

  it("rejects an anchor session that is not immediately before the release session", () => {
    expect(
      checkInvariants({ ...sessionRow, anchorSessionDay: "2025-07-01" }, ctx),
    ).toContain("anchor_session_not_adjacent");
  });

  it("rejects a session offset that does not match the measure", () => {
    expect(
      checkInvariants(
        { ...sessionRow, measure: "SESSION_PLUS_1", endpointSessionDay: "2025-07-03" },
        ctx,
      ),
    ).toContain("endpoint_session_offset_mismatch");
  });

  it("rejects a pctChange inconsistent with the stored prices", () => {
    expect(checkInvariants({ ...sessionRow, pctChange: 5 }, ctx)).toContain(
      "pct_change_inconsistent",
    );
  });

  it("rejects a non-positive price", () => {
    expect(checkInvariants({ ...sessionRow, anchorPrice: 0 }, ctx)).toContain(
      "non_positive_price",
    );
  });

  it("rejects a session day that is not a canonical session", () => {
    expect(
      checkInvariants({ ...sessionRow, endpointSessionDay: "2025-07-04" }, ctx),
    ).toContain("non_canonical_session_day");
  });

  it("applies instant ordering only to the intraday family", () => {
    const intradayRow = {
      ...sessionRow,
      measure: "INTRADAY_60M" as const,
      anchorKind: "PRE_RELEASE_INTRADAY_BAR" as const,
      anchorBarAt: new Date("2025-07-03T17:30:00Z"),
      anchorSessionDay: "2025-07-03",
      endpointBarAt: new Date("2025-07-03T19:00:00Z"),
      priceBasis: "AS_TRADED" as const,
    };
    expect(checkInvariants(intradayRow, ctx)).toEqual([]);

    expect(
      checkInvariants(
        { ...intradayRow, anchorBarAt: new Date("2025-07-03T18:30:00Z") },
        ctx,
      ),
    ).toContain("intraday_anchor_not_pre_release");
  });

  it("rejects an anchorKind that does not match the measure family", () => {
    expect(
      checkInvariants(
        { ...sessionRow, anchorKind: "PRE_RELEASE_INTRADAY_BAR" },
        ctx,
      ),
    ).toContain("anchor_kind_family_mismatch");
  });

  it("accepts SESSION_PLUS_1 and SESSION_PLUS_5 offsets computed from the calendar", () => {
    const wideCtx = {
      releaseAt: ctx.releaseAt,
      sessionDays: [
        "2025-07-01", "2025-07-02", "2025-07-03",
        "2025-07-07", "2025-07-08", "2025-07-09", "2025-07-10", "2025-07-11",
      ],
    };
    expect(
      checkInvariants(
        { ...sessionRow, measure: "SESSION_PLUS_1", endpointSessionDay: "2025-07-07" },
        wideCtx,
      ),
    ).toEqual([]);
    expect(
      checkInvariants(
        { ...sessionRow, measure: "SESSION_PLUS_5", endpointSessionDay: "2025-07-11" },
        wideCtx,
      ),
    ).toEqual([]);
  });

  it("rejects a non-finite or non-positive endpoint price", () => {
    expect(
      checkInvariants({ ...sessionRow, endpointPrice: Number.NaN }, ctx),
    ).toContain("non_positive_price");
    expect(
      checkInvariants({ ...sessionRow, endpointPrice: -1 }, ctx),
    ).toContain("non_positive_price");
  });
});
