import { describe, expect, it } from "vitest";

import {
  CONSENSUS_LABELS,
  releaseCells,
  releaseHasAnyValue,
} from "@/services/events/releaseView";
import type { DataReleaseView } from "@/types/events";

/**
 * The release grid is where "we don't know" is most likely to be rendered as a
 * number. Every case below is a shape the library actually produces: FRED and
 * BLS publish actuals only, so a missing consensus is the common row, not an
 * edge case.
 */

const release = (over: Partial<DataReleaseView> = {}): DataReleaseView => ({
  metricKey: "CPI_HEADLINE",
  metricName: "CPI (headline, YoY)",
  referencePeriodStart: "2025-06-01",
  expectedValue: null,
  actualValue: 2.4,
  priorValue: 2.3,
  surpriseMagnitude: null,
  expected: null,
  actual: "2.4%",
  prior: "2.3%",
  surprise: null,
  surpriseValue: null,
  actualSource: "FRED",
  actualSourceUrl: "https://fred.stlouisfed.org/series/CPIAUCSL",
  consensusStatus: "MISSING",
  consensusSource: null,
  consensusSourceUrl: null,
  consensusAsOf: null,
  ...over,
});

const cell = (view: DataReleaseView, key: string) =>
  releaseCells(view, "INFLATION").find((c) => c.key === key)!;

describe("releaseCells", () => {
  it("renders a missing consensus as absent, never as a value", () => {
    const consensus = cell(release(), "consensus");
    expect(consensus.value).toBeNull();
    expect(consensus.absenceReason).toBe("No forecast source");
  });

  it("does not compute a surprise without a consensus, and says why", () => {
    const surprise = cell(release(), "surprise");
    expect(surprise.value).toBeNull();
    expect(surprise.absenceReason).toBe("Requires a consensus");
  });

  it("renders a missing prior as absent rather than as 'unchanged'", () => {
    const prior = cell(release({ priorValue: null, prior: null }), "prior");
    expect(prior.value).toBeNull();
    expect(prior.absenceReason).toBe("No prior observation");
  });

  it("keeps a genuine zero surprise distinct from an absent one", () => {
    const measured = cell(
      release({
        expected: "2.4%",
        expectedValue: 2.4,
        surprise: "+0pp",
        surpriseMagnitude: 0,
        surpriseValue: 0,
        consensusStatus: "VERIFIED",
      }),
      "surprise",
    );
    expect(measured.value).toBe("+0pp");
    expect(measured.absenceReason).toBeNull();
    expect(measured.tone).toBe("neutral");
  });

  it("colours an inflation beat as a negative surprise", () => {
    // INFLATION is higherIsBetter: false — a hot print is bad news for risk
    // assets even though the number is larger.
    const hot = cell(
      release({
        expected: "2.3%",
        expectedValue: 2.3,
        surprise: "+0.1pp",
        surpriseMagnitude: 0.1,
        surpriseValue: 0.1,
        consensusStatus: "VERIFIED",
      }),
      "surprise",
    );
    expect(hot.tone).toBe("negative");
  });

  it("colours a jobs beat as a positive surprise", () => {
    const beat = releaseCells(
      release({
        metricName: "Nonfarm payrolls (MoM change)",
        surprise: "+40k",
        surpriseMagnitude: 40,
        surpriseValue: 40,
        consensusStatus: "VERIFIED",
      }),
      "JOBS",
    ).find((c) => c.key === "surprise")!;
    expect(beat.tone).toBe("positive");
  });

  it("never presents an unverified consensus in the verified voice", () => {
    const cells = releaseCells(
      release({
        expected: "2.3%",
        expectedValue: 2.3,
        surprise: "+0.1pp",
        surpriseMagnitude: 0.1,
        surpriseValue: 0.1,
        consensusStatus: "UNVERIFIED",
      }),
      "INFLATION",
    );
    const consensus = cells.find((c) => c.key === "consensus")!;
    const surprise = cells.find((c) => c.key === "surprise")!;
    expect(consensus.note).toBe("Unverified");
    expect(consensus.tone).toBe("caution");
    expect(surprise.tone).toBe("caution");
  });

  it("labels the three consensus states distinctly", () => {
    expect(new Set(Object.values(CONSENSUS_LABELS)).size).toBe(3);
    expect(CONSENSUS_LABELS.MISSING).toContain("unavailable");
  });

  it("always returns the four cells in a stable order", () => {
    expect(releaseCells(release(), "INFLATION").map((c) => c.key)).toEqual([
      "actual",
      "consensus",
      "prior",
      "surprise",
    ]);
  });
});

describe("releaseHasAnyValue", () => {
  it("is false when every value is absent", () => {
    expect(
      releaseHasAnyValue(
        release({ actual: null, expected: null, prior: null, surprise: null }),
      ),
    ).toBe(false);
  });

  it("is true when only the actual survived", () => {
    expect(releaseHasAnyValue(release({ prior: null }))).toBe(true);
  });
});
