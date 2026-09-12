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
  isEarlyClose: () => false,
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
      isEarlyClose: () => false,
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

describe("economic-close invariant (the Stage-2 BTC defect)", () => {
  // The SESSION family is NOT verified by `anchorBarAt < releaseAt` — a daily
  // bar's stamp is an identifier, not the instant its close became known. It
  // is verified by resolving the anchor's actual economic close per
  // SessionBasis and requiring THAT to precede the release.

  const btcContaminated = {
    ...sessionRow,
    sessionBasis: "CONTINUOUS_24_7" as const,
    // Exactly what Stage 2 proposed: the Eastern mapping labelled the bar
    // stamped 2025-07-03T00:00Z as session 2025-07-02. Its close is realised
    // one UTC day later, at 2025-07-04T00:00Z — 11.5h AFTER the release.
    anchorSessionDay: "2025-07-02",
    anchorBarAt: new Date("2025-07-03T00:00:00Z"),
    anchorPrice: 109647.9765625,
    endpointSessionDay: "2025-07-03",
    endpointBarAt: new Date("2025-07-04T00:00:00Z"),
    endpointPrice: 108034.3359375,
    pctChange: -1.4716558,
  };

  const nfpCtx = {
    releaseAt: new Date("2025-07-03T12:30:00Z"),
    sessionDays: ["2025-07-01", "2025-07-02", "2025-07-03", "2025-07-07"],
    isEarlyClose: () => false,
  };

  it("rejects the contaminated BTC measurement Stage 2 would have written", () => {
    expect(checkInvariants(btcContaminated, nfpCtx)).toContain(
      "anchor_close_not_pre_release",
    );
  });

  it("accepts the corrected BTC measurement", () => {
    // UTC-day mapping: session 2025-07-02 is the bar stamped 2025-07-02T00:00Z,
    // closing 2025-07-03T00:00Z — 12.5h BEFORE the release.
    expect(
      checkInvariants(
        {
          ...btcContaminated,
          anchorBarAt: new Date("2025-07-02T00:00:00Z"),
          anchorPrice: 108859.3203125,
          endpointBarAt: new Date("2025-07-03T00:00:00Z"),
          endpointPrice: 109647.9765625,
          pctChange: 0.7244729,
        },
        nfpCtx,
      ),
    ).toEqual([]);
  });

  it("accepts valid equity and futures anchors", () => {
    // Equity: 2025-07-02 closes 20:00Z. Futures: 2025-07-02 closes 21:00Z.
    // Both precede the 2025-07-03T18:00Z release.
    expect(checkInvariants(sessionRow, ctx)).toEqual([]);
    expect(
      checkInvariants({ ...sessionRow, sessionBasis: "EXTENDED_FUTURES" }, ctx),
    ).toEqual([]);
  });

  it("rejects an equity anchor whose 16:00 ET close lands after the release", () => {
    // Release 2025-07-02T17:00Z (13:00 EDT) with the anchor session the SAME
    // day: that session does not close until 20:00Z.
    expect(
      checkInvariants(
        { ...sessionRow, anchorSessionDay: "2025-07-02", releaseSessionDay: "2025-07-03" },
        { ...ctx, releaseAt: new Date("2025-07-02T17:00:00Z") },
      ),
    ).toContain("anchor_close_not_pre_release");
  });

  it("honours an early close when resolving the anchor's realisation", () => {
    // On an early-close day the equity anchor is realised at 17:00Z, so a
    // 17:30Z release is validly anchored where a 16:30Z one is not.
    const early = { ...ctx, isEarlyClose: (d: string) => d === "2025-07-02" };
    expect(
      checkInvariants(sessionRow, { ...early, releaseAt: new Date("2025-07-02T17:30:00Z") }),
    ).not.toContain("anchor_close_not_pre_release");
    expect(
      checkInvariants(sessionRow, { ...early, releaseAt: new Date("2025-07-02T16:30:00Z") }),
    ).toContain("anchor_close_not_pre_release");
  });

  it("does not apply the economic-close rule to the intraday family", () => {
    // INTRADAY_60M keeps its own instant-ordering check; its bars are stamped
    // at their open and carry no session close at all.
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
  });
});
