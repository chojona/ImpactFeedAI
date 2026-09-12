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

describe("universal ordering invariants (spec §6.1)", () => {
  // These are UNIVERSAL — applied to both families — and distinct from the
  // family-specific checks above. They do not replace `anchor_close_not_pre_release`
  // (session) or `intraday_anchor_not_pre_release` (intraday); they add a
  // weaker, always-applicable bar-ordering and session-ordering floor that
  // spec §6.1 requires the verifier to enforce for every row.

  it("rejects a row whose anchor bar is not strictly before its endpoint bar", () => {
    expect(
      checkInvariants(
        { ...sessionRow, anchorBarAt: new Date("2025-07-03T13:30:00Z"), endpointBarAt: new Date("2025-07-03T13:30:00Z") },
        ctx,
      ),
    ).toContain("anchor_bar_not_before_endpoint");

    expect(
      checkInvariants(
        { ...sessionRow, anchorBarAt: new Date("2025-07-04T13:30:00Z"), endpointBarAt: new Date("2025-07-03T13:30:00Z") },
        ctx,
      ),
    ).toContain("anchor_bar_not_before_endpoint");
  });

  it("rejects an anchor session day after the release session day", () => {
    expect(
      checkInvariants(
        { ...sessionRow, anchorSessionDay: "2025-07-07", releaseSessionDay: "2025-07-03" },
        { ...ctx, sessionDays: ["2025-07-01", "2025-07-02", "2025-07-03", "2025-07-07"] },
      ),
    ).toContain("anchor_session_after_release");
  });

  it("rejects an endpoint session day before the release session day", () => {
    expect(
      checkInvariants(
        { ...sessionRow, endpointSessionDay: "2025-07-01", releaseSessionDay: "2025-07-03" },
        ctx,
      ),
    ).toContain("endpoint_session_before_release");
  });

  it("accepts a valid intraday measurement under the universal checks", () => {
    const intradayRow = {
      ...sessionRow,
      measure: "INTRADAY_60M" as const,
      anchorKind: "PRE_RELEASE_INTRADAY_BAR" as const,
      anchorBarAt: new Date("2025-07-03T17:30:00Z"),
      anchorSessionDay: "2025-07-03",
      endpointSessionDay: "2025-07-03",
      endpointBarAt: new Date("2025-07-03T19:00:00Z"),
      releaseSessionDay: "2025-07-03",
      priceBasis: "AS_TRADED" as const,
    };
    const violations = checkInvariants(intradayRow, ctx);
    expect(violations).not.toContain("anchor_bar_not_before_endpoint");
    expect(violations).not.toContain("anchor_session_after_release");
    expect(violations).not.toContain("endpoint_session_before_release");
    expect(violations).toEqual([]);
  });

  it("accepts a valid equity session measurement under the universal checks", () => {
    const violations = checkInvariants(sessionRow, ctx);
    expect(violations).not.toContain("anchor_bar_not_before_endpoint");
    expect(violations).not.toContain("anchor_session_after_release");
    expect(violations).not.toContain("endpoint_session_before_release");
    expect(violations).toEqual([]);
  });

  it("accepts a valid futures session measurement under the universal checks", () => {
    const futuresRow = { ...sessionRow, sessionBasis: "EXTENDED_FUTURES" as const };
    const violations = checkInvariants(futuresRow, ctx);
    expect(violations).not.toContain("anchor_bar_not_before_endpoint");
    expect(violations).not.toContain("anchor_session_after_release");
    expect(violations).not.toContain("endpoint_session_before_release");
    expect(violations).toEqual([]);
  });

  it("accepts a valid continuous 24/7 session measurement under the universal checks", () => {
    // UTC-day bar: anchor stamped 2025-07-02T00:00Z, economic close realised
    // 2025-07-03T00:00Z — strictly before the 2025-07-03T18:00Z release.
    const continuousRow = {
      ...sessionRow,
      sessionBasis: "CONTINUOUS_24_7" as const,
      anchorBarAt: new Date("2025-07-02T00:00:00Z"),
      endpointBarAt: new Date("2025-07-03T00:00:00Z"),
    };
    const violations = checkInvariants(continuousRow, ctx);
    expect(violations).not.toContain("anchor_bar_not_before_endpoint");
    expect(violations).not.toContain("anchor_session_after_release");
    expect(violations).not.toContain("endpoint_session_before_release");
    expect(violations).toEqual([]);
  });
});

describe("intraday endpoint window (spec §6.2 table, previously unimplemented)", () => {
  // §6.2's table documents releaseAt + 60min <= endpointBarAt <= releaseAt +
  // 60min + slip as an INTRADAY_60M invariant, but checkInvariants never
  // enforced it — only reported it as a distribution statistic. Found during
  // the final spec-vs-code comparison after closing the universal-ordering
  // gap; same class of defect, closed the same way.
  const intradayRow = {
    measure: "INTRADAY_60M" as const,
    anchorKind: "PRE_RELEASE_INTRADAY_BAR" as const,
    anchorPrice: 100,
    anchorBarAt: new Date("2025-07-03T17:30:00Z"),
    anchorSessionDay: "2025-07-03",
    endpointPrice: 102,
    endpointSessionDay: "2025-07-03",
    releaseSessionDay: "2025-07-03",
    pctChange: 2,
    priceBasis: "AS_TRADED" as const,
    sessionBasis: "US_EQUITY_RTH" as const,
  };
  const releaseAt = new Date("2025-07-03T18:00:00Z");
  const intradayCtx = { releaseAt, sessionDays: ["2025-07-03"], isEarlyClose: () => false };

  it("accepts an endpoint exactly at the 60-minute target", () => {
    expect(
      checkInvariants({ ...intradayRow, endpointBarAt: new Date("2025-07-03T19:00:00Z") }, intradayCtx),
    ).not.toContain("intraday_endpoint_outside_window");
  });

  it("accepts an endpoint within the slip window", () => {
    // +90 min, matching the real elapsed-minute distribution observed in v3.
    expect(
      checkInvariants({ ...intradayRow, endpointBarAt: new Date("2025-07-03T19:30:00Z") }, intradayCtx),
    ).not.toContain("intraday_endpoint_outside_window");
  });

  it("rejects an endpoint before the 60-minute target", () => {
    expect(
      checkInvariants({ ...intradayRow, endpointBarAt: new Date("2025-07-03T18:30:00Z") }, intradayCtx),
    ).toContain("intraday_endpoint_outside_window");
  });

  it("rejects an endpoint beyond the slip window", () => {
    // Target is 19:00Z, slip is 2h, so the outer bound is 21:00Z.
    expect(
      checkInvariants({ ...intradayRow, endpointBarAt: new Date("2025-07-03T21:30:00Z") }, intradayCtx),
    ).toContain("intraday_endpoint_outside_window");
  });

  it("does not apply the intraday endpoint window to the session family", () => {
    expect(checkInvariants(sessionRow, ctx)).not.toContain("intraday_endpoint_outside_window");
  });
});
