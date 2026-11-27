import { describe, expect, it } from "vitest";

import {
  createEligibilityIndex,
  createFixtureNqArchiveAdapter,
  syntheticMinuteBars,
  type NqEligibilityIndex,
  type NqMinuteBar,
} from "@/services/market/nqArchive";

import {
  ROLLS,
  bar,
  edtSessionBars,
  tierA,
  tierB,
} from "./fixtures/nqArchive/helpers";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const extract = async (args: {
  bars: readonly NqMinuteBar[];
  eligibility: NqEligibilityIndex;
  releaseIso: string;
  beforeMs: number;
  afterMs: number;
}) => {
  const adapter = await createFixtureNqArchiveAdapter({
    bars: args.bars,
    rolls: ROLLS,
    eligibility: args.eligibility,
  });
  return adapter.extractEventWindow({
    releaseAt: new Date(args.releaseIso),
    beforeMs: args.beforeMs,
    afterMs: args.afterMs,
  });
};

describe("extractEventWindow request validation", () => {
  it("rejects non-finite instants and negative offsets", async () => {
    const adapter = await createFixtureNqArchiveAdapter({
      bars: [],
      rolls: ROLLS,
      eligibility: createEligibilityIndex({}),
    });
    const releaseAt = new Date("2024-06-12T12:30:00.000Z");
    await expect(
      adapter.extractEventWindow({
        releaseAt: new Date(Number.NaN),
        beforeMs: 0,
        afterMs: 0,
      }),
    ).rejects.toThrow(/releaseAt/);
    await expect(
      adapter.extractEventWindow({ releaseAt, beforeMs: -1, afterMs: 0 }),
    ).rejects.toThrow(/beforeMs/);
    await expect(
      adapter.extractEventWindow({
        releaseAt,
        beforeMs: 0,
        afterMs: Number.POSITIVE_INFINITY,
      }),
    ).rejects.toThrow(/afterMs/);
  });
});

describe("F3: exploratory qualification requires complete coverage", () => {
  const eligibility = createEligibilityIndex({
    exploratoryRows: [tierB("2024-06-12")],
  });

  it("refuses an empty Tier B window instead of labelling it exploratory", async () => {
    const result = await extract({
      bars: [],
      eligibility,
      releaseIso: "2024-06-12T12:30:00.000Z",
      beforeMs: MINUTE,
      afterMs: MINUTE,
    });
    expect(result.coverage.complete).toBe(false);
    expect(result.reactionQualification).toBe("refused");
    expect(result.eligibility.reasonCode).toBe("INCOMPLETE_EVENT_WINDOW");
    expect(result.refusalReasons).toContain("INCOMPLETE_EVENT_WINDOW");
  });

  it("refuses a partial Tier B window", async () => {
    const result = await extract({
      bars: edtSessionBars({
        contract: "NQM24",
        startIso: "2024-06-12T12:29:00.000Z",
        endIso: "2024-06-12T12:31:00.000Z",
        skip: (openAt) => openAt.toISOString() === "2024-06-12T12:30:00.000Z",
      }),
      eligibility,
      releaseIso: "2024-06-12T12:30:00.000Z",
      beforeMs: MINUTE,
      afterMs: MINUTE,
    });
    expect(result.coverage.missingOpenAts.map((d) => d.toISOString())).toEqual(
      ["2024-06-12T12:30:00.000Z"],
    );
    expect(result.reactionQualification).toBe("refused");
  });

  it("keeps a complete Tier B window exploratory", async () => {
    const result = await extract({
      bars: edtSessionBars({
        contract: "NQM24",
        startIso: "2024-06-12T12:29:00.000Z",
        endIso: "2024-06-12T12:31:00.000Z",
      }),
      eligibility,
      releaseIso: "2024-06-12T12:30:00.000Z",
      beforeMs: MINUTE,
      afterMs: MINUTE,
    });
    expect(result.reactionQualification).toBe("exploratory");
    expect(result.refusalReasons).toEqual([]);
  });
});

describe("F5: anchor and endpoint in the extracted window", () => {
  const eligibility = createEligibilityIndex({
    strictRows: [tierA("2024-06-12")],
  });

  it("anchors on the last bar fully closed before a mid-minute release", async () => {
    const bars = edtSessionBars({
      contract: "NQM24",
      startIso: "2024-06-12T12:20:00.000Z",
      endIso: "2024-06-12T12:45:00.000Z",
    });
    const releaseAt = new Date("2024-06-12T12:30:30.000Z");
    const result = await extract({
      bars,
      eligibility,
      releaseIso: releaseAt.toISOString(),
      beforeMs: 10 * MINUTE,
      afterMs: 10 * MINUTE,
    });

    expect(result.reactionQualification).toBe("strict");
    expect(result.anchor?.bar.openAt.toISOString()).toBe(
      "2024-06-12T12:29:00.000Z",
    );
    expect(result.anchor!.bar.openAt.getTime() + MINUTE).toBeLessThanOrEqual(
      releaseAt.getTime(),
    );
    const releaseBar = bars.find(
      (b) => b.openAt.toISOString() === "2024-06-12T12:30:00.000Z",
    )!;
    expect(result.anchor!.bar).not.toBe(releaseBar);
    expect(result.anchor!.price).toBe(result.anchor!.bar.close);

    // Target 12:40:30 → first bar opening at or after it is 12:41.
    expect(result.endpoint?.bar.openAt.toISOString()).toBe(
      "2024-06-12T12:41:00.000Z",
    );
    expect(result.endpoint!.price).toBe(result.endpoint!.bar.open);
  });

  it("always loads the anchor minute, even when beforeMs does not reach it", async () => {
    const bars = edtSessionBars({
      contract: "NQM24",
      startIso: "2024-06-12T12:29:00.000Z",
      endIso: "2024-06-12T12:36:00.000Z",
    });
    for (const [releaseIso, beforeMs] of [
      ["2024-06-12T12:30:00.000Z", 0],
      ["2024-06-12T12:30:30.000Z", 30_000],
    ] as const) {
      const result = await extract({
        bars,
        eligibility,
        releaseIso,
        beforeMs,
        afterMs: 5 * MINUTE,
      });
      expect(result.coverage.windowStart.toISOString()).toBe(
        "2024-06-12T12:29:00.000Z",
      );
      expect(result.anchor?.bar.openAt.toISOString()).toBe(
        "2024-06-12T12:29:00.000Z",
      );
      expect(result.reactionQualification).toBe("strict");
    }
  });

  it("refuses when the anchor minute has no bar", async () => {
    const result = await extract({
      bars: edtSessionBars({
        contract: "NQM24",
        startIso: "2024-06-12T12:30:00.000Z",
        endIso: "2024-06-12T12:35:00.000Z",
      }),
      eligibility,
      releaseIso: "2024-06-12T12:30:00.000Z",
      beforeMs: 0,
      afterMs: 5 * MINUTE,
    });
    expect(result.anchor).toBeNull();
    expect(result.endpoint?.bar.openAt.toISOString()).toBe(
      "2024-06-12T12:35:00.000Z",
    );
    expect(result.reactionQualification).toBe("refused");
    expect(result.refusalReasons).toEqual([
      "INCOMPLETE_EVENT_WINDOW",
      "ANCHOR_UNAVAILABLE",
    ]);
  });

  it("refuses when the endpoint target falls in the maintenance break", async () => {
    // 16:30 ET + 60 min → 17:30 ET on a Wednesday and on a Friday.
    for (const [date, releaseIso] of [
      ["2024-06-12", "2024-06-12T20:30:00.000Z"],
      ["2024-06-14", "2024-06-14T20:30:00.000Z"],
    ] as const) {
      const result = await extract({
        bars: edtSessionBars({
          contract: "NQM24",
          startIso: `${date}T20:25:00.000Z`,
          endIso: `${date}T21:30:00.000Z`,
        }),
        eligibility: createEligibilityIndex({ strictRows: [tierA(date)] }),
        releaseIso,
        beforeMs: 5 * MINUTE,
        afterMs: HOUR,
      });
      expect(result.coverage.complete).toBe(true);
      expect(result.endpoint).toBeNull();
      expect(result.reactionQualification).toBe("refused");
      expect(result.refusalReasons).toEqual(["ENDPOINT_UNAVAILABLE"]);
    }
  });

  it("refuses a Sunday-open release whose only anchor is Friday's close", async () => {
    // Sunday 2024-06-09 18:00 ET; the last earlier bar is Friday 16:59 ET.
    const result = await extract({
      bars: edtSessionBars({
        contract: "NQM24",
        startIso: "2024-06-07T20:00:00.000Z",
        endIso: "2024-06-09T22:05:00.000Z",
      }),
      eligibility: createEligibilityIndex({
        strictRows: [tierA("2024-06-07"), tierA("2024-06-10")],
      }),
      releaseIso: "2024-06-09T22:00:00.000Z",
      beforeMs: 50 * HOUR,
      afterMs: 5 * MINUTE,
    });
    expect(result.coverage.complete).toBe(true);
    expect(result.anchor).toBeNull();
    expect(result.reactionQualification).toBe("refused");
    expect(result.refusalReasons).toContain("ANCHOR_UNAVAILABLE");
  });

  it("refuses a fresh anchor that belongs to the previous session", async () => {
    // Release at 17:00 ET: the 16:59 bar closed on time but is Wednesday's
    // session while the release is first observable in Thursday's.
    const result = await extract({
      bars: edtSessionBars({
        contract: "NQM24",
        startIso: "2024-06-12T20:59:00.000Z",
        endIso: "2024-06-12T22:01:00.000Z",
      }),
      eligibility: createEligibilityIndex({
        strictRows: [tierA("2024-06-12"), tierA("2024-06-13")],
      }),
      releaseIso: "2024-06-12T21:00:00.000Z",
      beforeMs: MINUTE,
      afterMs: 61 * MINUTE,
    });
    expect(result.tradingDate).toBe("2024-06-13");
    expect(result.anchor?.bar.tradingDate).toBe("2024-06-12");
    expect(result.reactionQualification).toBe("refused");
    expect(result.refusalReasons).toEqual(["ANCHOR_OUTSIDE_RELEASE_SESSION"]);
  });
});

describe("F6: session-aware grid and multi-date windows", () => {
  it("qualifies a complete 1d window across the 17:00–18:00 ET maintenance break", async () => {
    const result = await extract({
      bars: edtSessionBars({
        contract: "NQM24",
        startIso: "2024-06-12T12:25:00.000Z",
        endIso: "2024-06-13T12:30:00.000Z",
      }),
      eligibility: createEligibilityIndex({
        strictRows: [tierA("2024-06-12"), tierA("2024-06-13")],
      }),
      releaseIso: "2024-06-12T12:30:00.000Z",
      beforeMs: 5 * MINUTE,
      afterMs: 24 * HOUR,
    });

    // 1446 grid minutes minus the 60-minute daily break.
    expect(result.coverage.expectedBars).toBe(1386);
    expect(result.coverage.excludedClosedMinutes).toBe(60);
    expect(result.coverage.complete).toBe(true);
    expect(result.sessionDates.map((s) => s.tradingDate)).toEqual([
      "2024-06-12",
      "2024-06-13",
    ]);
    expect(result.reactionQualification).toBe("strict");
  });

  it("refuses when a later session in the window is not eligible", async () => {
    const result = await extract({
      bars: edtSessionBars({
        contract: "NQM24",
        startIso: "2024-06-12T12:25:00.000Z",
        endIso: "2024-06-13T12:30:00.000Z",
      }),
      eligibility: createEligibilityIndex({
        strictRows: [tierA("2024-06-12")],
      }),
      releaseIso: "2024-06-12T12:30:00.000Z",
      beforeMs: 5 * MINUTE,
      afterMs: 24 * HOUR,
    });
    expect(result.coverage.complete).toBe(true);
    expect(result.reactionQualification).toBe("refused");
    expect(result.eligibility.reasonCode).toBe("WINDOW_SESSION_NOT_ELIGIBLE");
    expect(
      result.sessionDates.find((s) => s.tradingDate === "2024-06-13")
        ?.qualification,
    ).toBe("refused");
  });

  it("downgrades to the weakest qualification across touched sessions", async () => {
    const result = await extract({
      bars: edtSessionBars({
        contract: "NQM24",
        startIso: "2024-06-12T12:25:00.000Z",
        endIso: "2024-06-13T12:30:00.000Z",
      }),
      eligibility: createEligibilityIndex({
        strictRows: [tierA("2024-06-12")],
        exploratoryRows: [tierA("2024-06-12"), tierB("2024-06-13")],
      }),
      releaseIso: "2024-06-12T12:30:00.000Z",
      beforeMs: 5 * MINUTE,
      afterMs: 24 * HOUR,
    });
    expect(result.reactionQualification).toBe("exploratory");
  });

  it("refuses a window that crosses a contract roll", async () => {
    const result = await extract({
      bars: edtSessionBars({
        contract: "NQM24",
        startIso: "2024-06-14T12:25:00.000Z",
        endIso: "2024-06-17T12:30:00.000Z",
      }),
      eligibility: createEligibilityIndex({
        strictRows: [tierA("2024-06-14"), tierA("2024-06-17", "NQU24")],
      }),
      releaseIso: "2024-06-14T12:30:00.000Z",
      beforeMs: 5 * MINUTE,
      afterMs: 72 * HOUR,
    });
    expect(result.contractSelection.contract).toBe("NQM24");
    expect(result.sessionDates.map((s) => [s.tradingDate, s.contract])).toEqual(
      [
        ["2024-06-14", "NQM24"],
        ["2024-06-17", "NQU24"],
      ],
    );
    expect(result.reactionQualification).toBe("refused");
    expect(result.refusalReasons).toContain("WINDOW_CROSSES_CONTRACT_ROLL");
  });

  it("refuses when the allowlist's expected_active_minutes disagrees with the session model", async () => {
    const bars = edtSessionBars({
      contract: "NQM24",
      startIso: "2024-06-12T12:25:00.000Z",
      endIso: "2024-06-12T12:35:00.000Z",
    });
    const agree = await extract({
      bars,
      eligibility: createEligibilityIndex({ strictRows: [tierA("2024-06-12")] }),
      releaseIso: "2024-06-12T12:30:00.000Z",
      beforeMs: 5 * MINUTE,
      afterMs: 5 * MINUTE,
    });
    expect(agree.reactionQualification).toBe("strict");
    expect(agree.sessionDates[0]!.expectedActiveMinutes).toBe(1380);

    // A 1,365-minute session (e.g. a 15-minute intraday halt) on a slice
    // that is itself complete.
    const disagree = await extract({
      bars,
      eligibility: createEligibilityIndex({
        strictRows: [{ ...tierA("2024-06-12"), expectedActiveMinutes: 1365 }],
      }),
      releaseIso: "2024-06-12T12:30:00.000Z",
      beforeMs: 5 * MINUTE,
      afterMs: 5 * MINUTE,
    });
    expect(disagree.coverage.complete).toBe(true);
    expect(disagree.reactionQualification).toBe("refused");
    expect(disagree.refusalReasons).toEqual([
      "SESSION_GRID_MISMATCH_CERTIFICATION",
    ]);
  });

  it("refuses rather than skips when a touched session has no expected_active_minutes", async () => {
    const result = await extract({
      bars: edtSessionBars({
        contract: "NQM24",
        startIso: "2024-06-12T12:25:00.000Z",
        endIso: "2024-06-12T12:35:00.000Z",
      }),
      eligibility: createEligibilityIndex({
        exploratoryRows: [{ ...tierB("2024-06-12"), expectedActiveMinutes: null }],
      }),
      releaseIso: "2024-06-12T12:30:00.000Z",
      beforeMs: 5 * MINUTE,
      afterMs: 5 * MINUTE,
    });
    expect(result.coverage.complete).toBe(true);
    expect(result.reactionQualification).toBe("refused");
    expect(result.refusalReasons).toEqual(["SESSION_GRID_EVIDENCE_MISSING"]);
  });

  it("refuses when a later session's certification contract contradicts its allowlist contract", async () => {
    const result = await extract({
      bars: edtSessionBars({
        contract: "NQM24",
        startIso: "2024-06-12T12:25:00.000Z",
        endIso: "2024-06-13T12:30:00.000Z",
      }),
      eligibility: createEligibilityIndex({
        strictRows: [tierA("2024-06-12"), tierA("2024-06-13")],
        certificationContracts: new Map([
          ["2024-06-12", "NQM24"],
          ["2024-06-13", "NQU24"],
        ]),
      }),
      releaseIso: "2024-06-12T12:30:00.000Z",
      beforeMs: 5 * MINUTE,
      afterMs: 24 * HOUR,
    });
    expect(result.coverage.complete).toBe(true);
    expect(
      result.sessionDates.find((s) => s.tradingDate === "2024-06-13")
        ?.conflictsWithCertification,
    ).toBe(true);
    expect(result.reactionQualification).toBe("refused");
    expect(result.refusalReasons).toEqual(["CONTRACT_CERTIFICATION_CONFLICT"]);
  });

  it("refuses when the strict and exploratory allowlists name different contracts", async () => {
    const result = await extract({
      bars: edtSessionBars({
        contract: "NQM24",
        startIso: "2024-06-12T12:00:00.000Z",
        endIso: "2024-06-12T13:30:00.000Z",
      }),
      eligibility: createEligibilityIndex({
        strictRows: [tierA("2024-06-12", "NQM24")],
        exploratoryRows: [tierA("2024-06-12", "NQU24")],
      }),
      releaseIso: "2024-06-12T12:30:00.000Z",
      beforeMs: 30 * MINUTE,
      afterMs: HOUR,
    });
    expect(result.coverage.complete).toBe(true);
    expect(result.reactionQualification).toBe("refused");
    expect(result.eligibility.reasonCode).toBe("CONFLICTING_ALLOWLIST_EVIDENCE");
  });

  it("refuses when the release session's certification contract contradicts its allowlist contract", async () => {
    const result = await extract({
      bars: edtSessionBars({
        contract: "NQM24",
        startIso: "2024-06-12T12:25:00.000Z",
        endIso: "2024-06-12T12:35:00.000Z",
      }),
      eligibility: createEligibilityIndex({
        strictRows: [tierA("2024-06-12")],
        certificationContracts: new Map([["2024-06-12", "NQU24"]]),
      }),
      releaseIso: "2024-06-12T12:30:00.000Z",
      beforeMs: 5 * MINUTE,
      afterMs: 5 * MINUTE,
    });
    expect(result.reactionQualification).toBe("refused");
    expect(result.refusalReasons).toEqual(["CONTRACT_CERTIFICATION_CONFLICT"]);
  });

  it("refuses bars stamped inside the maintenance break", async () => {
    const result = await extract({
      bars: [
        ...edtSessionBars({
          contract: "NQM24",
          startIso: "2024-06-12T20:55:00.000Z",
          endIso: "2024-06-12T22:05:00.000Z",
        }),
        bar("2024-06-12T21:30:00.000Z", { tradingDate: "2024-06-12" }),
      ],
      eligibility: createEligibilityIndex({
        strictRows: [tierA("2024-06-12"), tierA("2024-06-13")],
      }),
      releaseIso: "2024-06-12T21:00:00.000Z",
      beforeMs: 5 * MINUTE,
      afterMs: 65 * MINUTE,
    });
    expect(result.coverage.complete).toBe(true);
    expect(result.coverage.unexpectedOpenAts.map((d) => d.toISOString())).toEqual(
      ["2024-06-12T21:30:00.000Z"],
    );
    expect(result.refusalReasons).toContain("BARS_OUTSIDE_SESSION_GRID");
    expect(result.reactionQualification).toBe("refused");
  });

  it("refuses pre-2012 windows whose session rules are not modelled", async () => {
    const result = await extract({
      bars: syntheticMinuteBars({
        contract: "NQM11",
        tradingDate: "2011-06-15",
        start: new Date("2011-06-15T12:25:00.000Z"),
        count: 11,
      }),
      eligibility: createEligibilityIndex({
        strictRows: [tierA("2011-06-15", "NQM11")],
      }),
      releaseIso: "2011-06-15T12:30:00.000Z",
      beforeMs: 5 * MINUTE,
      afterMs: 5 * MINUTE,
    });
    expect(result.reactionQualification).toBe("refused");
    expect(result.refusalReasons).toContain("PRE_2012_TRADING_DATE_UNSUPPORTED");
  });
});

describe("F13: archive trading_date and certification calendar", () => {
  it("prefers the certification calendar for a Sunday evening before a holiday Monday", async () => {
    // 2024-01-14 18:30 EST; Monday 2024-01-15 (MLK) is absent from the calendar.
    const result = await extract({
      bars: syntheticMinuteBars({
        contract: "NQH24",
        tradingDate: "2024-01-16",
        start: new Date("2024-01-14T23:29:00.000Z"),
        count: 12,
      }),
      eligibility: createEligibilityIndex({
        // Synthetic count equal to the model's folded session, so only the
        // calendar mapping is under test here.
        strictRows: [
          { ...tierA("2024-01-16", "NQH24"), expectedActiveMinutes: 2760 },
        ],
        tradingDates: ["2024-01-12", "2024-01-16", "2024-01-17"],
      }),
      releaseIso: "2024-01-14T23:30:00.000Z",
      beforeMs: MINUTE,
      afterMs: 10 * MINUTE,
    });
    expect(result.tradingDate).toBe("2024-01-16");
    expect(result.tradingDateBasis).toBe("certification_calendar");
    expect(result.reactionQualification).toBe("strict");
  });

  it("refuses the same holiday-adjacent instant when only the heuristic is available", async () => {
    const result = await extract({
      bars: [],
      eligibility: createEligibilityIndex({
        strictRows: [tierA("2024-01-15", "NQH24"), tierA("2024-01-16", "NQH24")],
      }),
      releaseIso: "2024-01-14T23:30:00.000Z",
      beforeMs: 0,
      afterMs: 10 * MINUTE,
    });
    expect(result.tradingDateBasis).toBe("heuristic_fallback");
    expect(result.reactionQualification).toBe("refused");
    expect(result.eligibility.reasonCode).toBe("HOLIDAY_ADJACENT_TRADING_DATE");
  });

  it("refuses when an archive bar's trading_date disagrees with the resolved session", async () => {
    const bars = edtSessionBars({
      contract: "NQM24",
      startIso: "2024-06-12T12:25:00.000Z",
      endIso: "2024-06-12T12:35:00.000Z",
    }).map((b, i) => (i === 3 ? { ...b, tradingDate: "2024-06-13" } : b));
    const result = await extract({
      bars,
      eligibility: createEligibilityIndex({
        strictRows: [tierA("2024-06-12")],
      }),
      releaseIso: "2024-06-12T12:30:00.000Z",
      beforeMs: 5 * MINUTE,
      afterMs: 5 * MINUTE,
    });
    expect(result.reactionQualification).toBe("refused");
    expect(result.refusalReasons).toContain("ARCHIVE_TRADING_DATE_MISMATCH");
  });
});
