import { describe, expect, it } from "vitest";

import {
  NqArchivePathError,
  buildCoverageReport,
  createEligibilityIndex,
  createFixtureNqArchiveAdapter,
  qualificationFromEvidence,
  releaseMinuteOpen,
  resolveNqArchivePaths,
  selectContractAsOf,
  syntheticMinuteBars,
  tradingDateForReleaseAt,
  utcMinuteOpen,
  type AllowlistRow,
  type NqEligibilityIndex,
  type NqRollBoundary,
  type NqSessionEligibility,
} from "@/services/market/nqArchive";

const rolls: readonly NqRollBoundary[] = [
  {
    fromDate: "2024-03-15",
    toDate: "2024-03-18",
    oldContract: "NQH24",
    newContract: "NQM24",
    volumeOld: 100,
    volumeNew: 200,
    pairedMinuteCount: 1000,
    artificialCrossContractReturnUsed: false,
  },
  {
    fromDate: "2024-06-14",
    toDate: "2024-06-17",
    oldContract: "NQM24",
    newContract: "NQU24",
    volumeOld: 110,
    volumeNew: 220,
    pairedMinuteCount: 1000,
    artificialCrossContractReturnUsed: false,
  },
];

const eligibilityFor = (
  rows: Readonly<Record<string, NqSessionEligibility>>,
): NqEligibilityIndex => ({
  certificationContract: (tradingDate) =>
    rows[tradingDate]?.selectedContract ?? null,
  lookup: (tradingDate) =>
    rows[tradingDate] ?? {
      tradingDate,
      tier: "UNKNOWN",
      researchEligibility: null,
      reasonCode: "NOT_ON_ALLOWLIST",
      calendarValidity: null,
      providerIntegrity: null,
      contractSelectionEvidence: null,
      observedCoverage: null,
      selectedContract: null,
      sourceIds: [],
      qualification: "refused",
    },
});

const allowlistRow = (
  partial: Partial<AllowlistRow> &
    Pick<AllowlistRow, "tradingDate" | "tier" | "researchEligibility">,
): AllowlistRow => ({
  reasonCode: partial.reasonCode ?? "FIXTURE",
  calendarValidity: partial.calendarValidity ?? "REVIEWED_REGULAR",
  providerIntegrity: partial.providerIntegrity ?? "AVAILABLE",
  contractSelection: partial.contractSelection ?? "PRIOR_VOLUME_PRESENT",
  observedCoverage: partial.observedCoverage ?? "FULL_ACTIVE_GRID",
  selectedContract: partial.selectedContract ?? "NQM24",
  sourceIds: partial.sourceIds ?? ["FIXTURE"],
  tradingDate: partial.tradingDate,
  tier: partial.tier,
  researchEligibility: partial.researchEligibility,
});

const strictSession = (
  overrides: Partial<NqSessionEligibility> = {},
): NqSessionEligibility => ({
  tradingDate: "2024-06-12",
  tier: "A",
  researchEligibility: "STRICT_AND_EXPLORATORY",
  reasonCode: "A_SOURCE_REVIEWED_COMPLETE",
  calendarValidity: "REVIEWED_REGULAR",
  providerIntegrity: "AVAILABLE",
  contractSelectionEvidence: "PRIOR_VOLUME_PRESENT",
  observedCoverage: "FULL_ACTIVE_GRID",
  selectedContract: "NQM24",
  sourceIds: ["FIXTURE"],
  qualification: "strict",
  ...overrides,
});

describe("resolveNqArchivePaths", () => {
  it("resolves from NQ_ARCHIVE_ROOT without copying files", () => {
    const paths = resolveNqArchivePaths({
      NQ_ARCHIVE_ROOT: "/data/databento-nq-full-history",
    });
    expect(paths.outrightParquet).toBe(
      "/data/databento-nq-full-history/nq_outright_ohlcv_1m.parquet",
    );
    expect(paths.rollsCsv).toBe("/data/databento-nq-full-history/rolls.csv");
    expect(paths.strictAllowlistCsv).toContain("strict-certified-allowlist.csv");
  });

  it("rejects continuous-series paths", () => {
    expect(() =>
      resolveNqArchivePaths({
        NQ_OUTRIGHT_PARQUET:
          "/Projects/nq-continuous-v1.0.0/adjusted.parquet",
        NQ_ROLLS_CSV: "/Projects/nq-continuous-v1.0.0/rollover-manifest.json",
      }),
    ).toThrow(NqArchivePathError);
  });

  it("requires configured paths", () => {
    expect(() => resolveNqArchivePaths({})).toThrow(/NQ archive paths/);
  });
});

describe("tradingDateForReleaseAt", () => {
  it("maps an 08:30 ET weekday release to that NY calendar date", () => {
    const releaseAt = new Date("2024-06-12T12:30:00.000Z");
    expect(tradingDateForReleaseAt(releaseAt)).toBe("2024-06-12");
  });

  it("rolls Sunday 18:00 ET open to Monday trading date", () => {
    const open = new Date("2024-06-16T22:00:00.000Z");
    expect(tradingDateForReleaseAt(open)).toBe("2024-06-17");
  });
});

describe("selectContractAsOf", () => {
  it("uses only rolls activated on or before the trading date", () => {
    expect(selectContractAsOf(rolls, "2024-03-17").contract).toBe("NQH24");
    expect(selectContractAsOf(rolls, "2024-03-17").method).toBe(
      "pre_first_roll_contract",
    );
    expect(selectContractAsOf(rolls, "2024-03-18").contract).toBe("NQM24");
    expect(selectContractAsOf(rolls, "2024-03-18").method).toBe(
      "prior_session_volume_roll",
    );
    expect(selectContractAsOf(rolls, "2024-06-17").contract).toBe("NQU24");
  });

  it("never selects a future roll boundary", () => {
    const beforeSecondRoll = selectContractAsOf(rolls, "2024-06-16");
    expect(beforeSecondRoll.contract).toBe("NQM24");
    expect(beforeSecondRoll.activatingRoll?.toDate).toBe("2024-03-18");
  });

  it("flags certification conflicts without inventing a substitute", () => {
    const selection = selectContractAsOf(rolls, "2024-06-17", "WRONG");
    expect(selection.contract).toBe("NQU24");
    expect(selection.conflictsWithCertification).toBe(true);
  });
});

describe("qualificationFromEvidence", () => {
  it("requires Tier A AND STRICT_AND_EXPLORATORY for strict", () => {
    expect(
      qualificationFromEvidence("A", "STRICT_AND_EXPLORATORY"),
    ).toBe("strict");
    expect(qualificationFromEvidence("A", "EXPLORATORY_ONLY")).toBe("refused");
    expect(qualificationFromEvidence("A", null)).toBe("refused");
    expect(
      qualificationFromEvidence("B", "STRICT_AND_EXPLORATORY"),
    ).toBe("refused");
  });

  it("requires Tier B AND EXPLORATORY_ONLY for exploratory", () => {
    expect(qualificationFromEvidence("B", "EXPLORATORY_ONLY")).toBe(
      "exploratory",
    );
    expect(qualificationFromEvidence("B", "STRICT_AND_EXPLORATORY")).toBe(
      "refused",
    );
  });
});

describe("createEligibilityIndex conflicts", () => {
  it("refuses when Tier A/B evidence conflicts across allowlists", () => {
    const index = createEligibilityIndex({
      strictRows: [
        allowlistRow({
          tradingDate: "2024-06-12",
          tier: "A",
          researchEligibility: "STRICT_AND_EXPLORATORY",
        }),
      ],
      exploratoryRows: [
        allowlistRow({
          tradingDate: "2024-06-12",
          tier: "B",
          researchEligibility: "EXPLORATORY_ONLY",
        }),
      ],
    });
    const row = index.lookup("2024-06-12");
    expect(row.qualification).toBe("refused");
    expect(row.reasonCode).toBe("CONFLICTING_ALLOWLIST_EVIDENCE");
    expect(row.tier).toBe("UNKNOWN");
  });
});

describe("timestamp alignment and missing bars", () => {
  it("aligns releaseAt to the UTC minute open that contains it", () => {
    const releaseAt = new Date("2024-06-12T12:30:45.123Z");
    expect(releaseMinuteOpen(releaseAt).toISOString()).toBe(
      "2024-06-12T12:30:00.000Z",
    );
  });

  it("lists interior missing minutes on the full requested grid", () => {
    const start = new Date("2024-06-12T12:00:00.000Z");
    const skip = [new Date("2024-06-12T12:02:00.000Z")];
    const bars = syntheticMinuteBars({
      contract: "NQM24",
      tradingDate: "2024-06-12",
      start,
      count: 5,
      skipOpens: skip,
    });
    const coverage = buildCoverageReport({
      windowStart: start,
      windowEnd: new Date("2024-06-12T12:04:00.000Z"),
      selectedContract: "NQM24",
      bars,
    });
    expect(coverage.expectedBars).toBe(5);
    expect(coverage.observedBars).toBe(4);
    expect(coverage.complete).toBe(false);
    expect(coverage.missingOpenAts.map((d) => d.toISOString())).toEqual([
      "2024-06-12T12:02:00.000Z",
    ]);
  });

  it("includes leading and trailing gaps against the requested window", () => {
    const windowStart = new Date("2024-06-12T12:00:00.000Z");
    const windowEnd = new Date("2024-06-12T12:04:00.000Z");
    const bars = syntheticMinuteBars({
      contract: "NQM24",
      tradingDate: "2024-06-12",
      start: new Date("2024-06-12T12:01:00.000Z"),
      count: 2,
    });
    const coverage = buildCoverageReport({
      windowStart,
      windowEnd,
      selectedContract: "NQM24",
      bars,
    });
    expect(coverage.missingOpenAts.map((d) => d.toISOString())).toEqual([
      "2024-06-12T12:00:00.000Z",
      "2024-06-12T12:03:00.000Z",
      "2024-06-12T12:04:00.000Z",
    ]);
    expect(coverage.complete).toBe(false);
  });

  it("treats an empty window as fully missing", () => {
    const windowStart = new Date("2024-06-12T12:00:00.000Z");
    const windowEnd = new Date("2024-06-12T12:02:00.000Z");
    const coverage = buildCoverageReport({
      windowStart,
      windowEnd,
      selectedContract: "NQM24",
      bars: [],
    });
    expect(coverage.expectedBars).toBe(3);
    expect(coverage.observedBars).toBe(0);
    expect(coverage.complete).toBe(false);
    expect(coverage.missingOpenAts).toHaveLength(3);
  });

  it("counts foreign-contract bars without mixing them into coverage", () => {
    const start = utcMinuteOpen(new Date("2024-06-12T12:00:00.000Z"));
    const primary = syntheticMinuteBars({
      contract: "NQM24",
      tradingDate: "2024-06-12",
      start,
      count: 2,
    });
    const foreign = syntheticMinuteBars({
      contract: "NQU24",
      tradingDate: "2024-06-12",
      start,
      count: 2,
      basePrice: 16_000,
    });
    const coverage = buildCoverageReport({
      windowStart: start,
      windowEnd: new Date(start.getTime() + 60_000),
      selectedContract: "NQM24",
      bars: [...primary, ...foreign],
    });
    expect(coverage.observedBars).toBe(2);
    expect(coverage.foreignContractBars).toBe(2);
    expect(coverage.complete).toBe(true);
  });
});

describe("extractEventWindow", () => {
  it("returns within-contract bars around a verified release timestamp", async () => {
    const releaseAt = new Date("2024-06-12T12:30:00.000Z");
    const start = new Date("2024-06-12T12:25:00.000Z");
    const bars = syntheticMinuteBars({
      contract: "NQM24",
      tradingDate: "2024-06-12",
      start,
      count: 20,
    });
    const adapter = await createFixtureNqArchiveAdapter({
      bars,
      rolls,
      eligibility: eligibilityFor({
        "2024-06-12": strictSession(),
      }),
    });

    const result = await adapter.extractEventWindow({
      releaseAt,
      beforeMs: 5 * 60_000,
      afterMs: 10 * 60_000,
    });

    expect(result.tradingDate).toBe("2024-06-12");
    expect(result.contractSelection.contract).toBe("NQM24");
    expect(result.reactionQualification).toBe("strict");
    expect(result.coverage.complete).toBe(true);
    expect(result.provenance.continuousSeriesRejected).toBe(true);
    expect(result.provenance.seriesKind).toBe("quarterly_outright");
    expect(result.bars.every((bar) => bar.contract === "NQM24")).toBe(true);
    expect(result.bars.length).toBeGreaterThan(0);
    expect(result.bars[0]!.openAt.getTime()).toBeGreaterThanOrEqual(
      releaseAt.getTime() - 5 * 60_000,
    );
    expect(
      result.bars[result.bars.length - 1]!.openAt.getTime(),
    ).toBeLessThanOrEqual(releaseAt.getTime() + 10 * 60_000);
  });

  it("refuses strict qualification when the requested window is incomplete", async () => {
    const releaseAt = new Date("2024-06-12T12:30:00.000Z");
    const bars = syntheticMinuteBars({
      contract: "NQM24",
      tradingDate: "2024-06-12",
      start: new Date("2024-06-12T12:30:00.000Z"),
      count: 2,
      skipOpens: [new Date("2024-06-12T12:31:00.000Z")],
    });
    const adapter = await createFixtureNqArchiveAdapter({
      bars,
      rolls,
      eligibility: eligibilityFor({
        "2024-06-12": strictSession(),
      }),
    });

    const result = await adapter.extractEventWindow({
      releaseAt,
      beforeMs: 0,
      afterMs: 2 * 60_000,
    });

    expect(result.coverage.complete).toBe(false);
    expect(result.reactionQualification).toBe("refused");
    expect(result.eligibility.reasonCode).toBe("INCOMPLETE_EVENT_WINDOW");
  });

  it("refuses strict qualification for an empty requested window", async () => {
    const releaseAt = new Date("2024-06-12T12:30:00.000Z");
    const adapter = await createFixtureNqArchiveAdapter({
      bars: [],
      rolls,
      eligibility: eligibilityFor({
        "2024-06-12": strictSession(),
      }),
    });

    const result = await adapter.extractEventWindow({
      releaseAt,
      beforeMs: 60_000,
      afterMs: 60_000,
    });

    expect(result.bars).toHaveLength(0);
    expect(result.coverage.expectedBars).toBe(3);
    expect(result.coverage.complete).toBe(false);
    expect(result.reactionQualification).toBe("refused");
    expect(result.eligibility.reasonCode).toBe("INCOMPLETE_EVENT_WINDOW");
  });

  it("refuses qualification on a contract-boundary date with certification conflict", async () => {
    const releaseAt = new Date("2024-06-17T12:30:00.000Z");
    const start = new Date("2024-06-17T12:00:00.000Z");
    const bars = [
      ...syntheticMinuteBars({
        contract: "NQU24",
        tradingDate: "2024-06-17",
        start,
        count: 40,
      }),
      ...syntheticMinuteBars({
        contract: "NQM24",
        tradingDate: "2024-06-17",
        start,
        count: 40,
        basePrice: 14_000,
      }),
    ];

    const adapter = await createFixtureNqArchiveAdapter({
      bars,
      rolls,
      eligibility: eligibilityFor({
        "2024-06-17": strictSession({
          tradingDate: "2024-06-17",
          selectedContract: "NQM24",
        }),
      }),
    });

    const result = await adapter.extractEventWindow({
      releaseAt,
      beforeMs: 30 * 60_000,
      afterMs: 30 * 60_000,
    });

    expect(result.contractSelection.contract).toBe("NQU24");
    expect(result.contractSelection.conflictsWithCertification).toBe(true);
    expect(result.reactionQualification).toBe("refused");
    expect(result.eligibility.reasonCode).toBe("CONTRACT_CERTIFICATION_CONFLICT");
    expect(result.bars.every((bar) => bar.contract === "NQU24")).toBe(true);
  });

  it("does not promote Tier-B exploratory sessions to strict qualification", async () => {
    const releaseAt = new Date("2024-06-12T12:30:00.000Z");
    const bars = syntheticMinuteBars({
      contract: "NQM24",
      tradingDate: "2024-06-12",
      start: new Date("2024-06-12T12:00:00.000Z"),
      count: 40,
    });
    const adapter = await createFixtureNqArchiveAdapter({
      bars,
      rolls,
      eligibility: eligibilityFor({
        "2024-06-12": strictSession({
          tier: "B",
          researchEligibility: "EXPLORATORY_ONLY",
          reasonCode: "B_REGULAR_REGIME_FULL_ACTIVE_GRID",
          calendarValidity: "REGIME_PROVISIONAL",
          qualification: "exploratory",
        }),
      }),
    });

    const result = await adapter.extractEventWindow({
      releaseAt,
      beforeMs: 60_000,
      afterMs: 60_000,
    });
    expect(result.reactionQualification).toBe("exploratory");
    expect(result.eligibility.tier).toBe("B");
  });

  it("refuses sessions absent from certification allowlists", async () => {
    const releaseAt = new Date("2024-06-12T12:30:00.000Z");
    const adapter = await createFixtureNqArchiveAdapter({
      bars: syntheticMinuteBars({
        contract: "NQM24",
        tradingDate: "2024-06-12",
        start: new Date("2024-06-12T12:00:00.000Z"),
        count: 10,
      }),
      rolls,
      eligibility: eligibilityFor({}),
    });
    const result = await adapter.extractEventWindow({
      releaseAt,
      beforeMs: 60_000,
      afterMs: 60_000,
    });
    expect(result.reactionQualification).toBe("refused");
    expect(result.eligibility.reasonCode).toBe("NOT_ON_ALLOWLIST");
  });
});
