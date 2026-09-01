import { describe, expect, it } from "vitest";

import {
  CONSENSUS_LABELS,
  UNVERIFIED_CONSENSUS_NOTE,
  releaseCells,
  releaseHasAnyValue,
  surpriseDirection,
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
    expect(consensus.provenance).toBe("unverified");
    expect(consensus.note).toBe(UNVERIFIED_CONSENSUS_NOTE);
    expect(consensus.tone).toBe("caution");
    expect(surprise.provenance).toBe("unverified");
    expect(surprise.note).toBe(UNVERIFIED_CONSENSUS_NOTE);
  });

  /**
   * The regression this pair of axes exists to prevent. Provenance used to be a
   * third value on the tone, so an unverified consensus rendered amber and the
   * beat/miss disappeared — on a library where 20 of 21 releases are
   * `UNVERIFIED`, that meant the product never once showed a surprise
   * direction. Both facts have to survive together.
   */
  it("still shows the surprise direction when the consensus is unverified", () => {
    const hot = cell(
      release({
        expected: "2.3%",
        expectedValue: 2.3,
        surprise: "+0.1pp",
        surpriseMagnitude: 0.1,
        surpriseValue: 0.1,
        consensusStatus: "UNVERIFIED",
      }),
      "surprise",
    );
    expect(hot.direction).toBe("negative");
    expect(hot.tone).toBe("negative");
    expect(hot.provenance).toBe("unverified");
    expect(hot.note).toBe(UNVERIFIED_CONSENSUS_NOTE);
  });

  it("shows an unverified jobs beat as positive, not as unknown", () => {
    const beat = releaseCells(
      release({
        metricName: "Nonfarm payrolls (MoM change)",
        expected: "185k",
        expectedValue: 185,
        surprise: "+168k",
        surpriseMagnitude: 168,
        surpriseValue: 168,
        consensusStatus: "UNVERIFIED",
      }),
      "JOBS",
    ).find((c) => c.key === "surprise")!;
    expect(beat.direction).toBe("positive");
    expect(beat.tone).toBe("positive");
    expect(beat.provenance).toBe("unverified");
  });

  it("marks a verified surprise as verified and leaves it unqualified", () => {
    const beat = releaseCells(
      release({
        metricName: "Nonfarm payrolls (MoM change)",
        expected: "185k",
        expectedValue: 185,
        surprise: "+168k",
        surpriseMagnitude: 168,
        surpriseValue: 168,
        consensusStatus: "VERIFIED",
      }),
      "JOBS",
    ).find((c) => c.key === "surprise")!;
    expect(beat.provenance).toBe("verified");
    expect(beat.note).toBeNull();
    expect(beat.tone).toBe("positive");
  });

  it("keeps direction and provenance independent across all six combinations", () => {
    const combos = [
      { status: "VERIFIED", value: 0.1, direction: "negative", note: null },
      { status: "VERIFIED", value: -0.1, direction: "positive", note: null },
      { status: "VERIFIED", value: 0, direction: "neutral", note: null },
      {
        status: "UNVERIFIED",
        value: 0.1,
        direction: "negative",
        note: UNVERIFIED_CONSENSUS_NOTE,
      },
      {
        status: "UNVERIFIED",
        value: -0.1,
        direction: "positive",
        note: UNVERIFIED_CONSENSUS_NOTE,
      },
      {
        status: "UNVERIFIED",
        value: 0,
        direction: "neutral",
        note: UNVERIFIED_CONSENSUS_NOTE,
      },
    ] as const;

    for (const combo of combos) {
      const surprise = cell(
        release({
          expected: "2.3%",
          expectedValue: 2.3,
          surprise: "x",
          surpriseMagnitude: combo.value,
          surpriseValue: combo.value,
          consensusStatus: combo.status,
        }),
        "surprise",
      );
      expect(surprise.direction).toBe(combo.direction);
      expect(surprise.note).toBe(combo.note);
    }
  });

  it("reports a missing consensus as missing rather than as unverified", () => {
    const cells = releaseCells(release(), "INFLATION");
    const surprise = cells.find((c) => c.key === "surprise")!;
    const consensus = cells.find((c) => c.key === "consensus")!;
    expect(surprise.provenance).toBe("missing");
    expect(surprise.direction).toBeNull();
    expect(surprise.tone).toBe("neutral");
    expect(surprise.note).toBeNull();
    expect(consensus.provenance).toBe("missing");
    expect(consensus.tone).toBe("neutral");
  });

  it("leaves provenance null on the cells that do not depend on a consensus", () => {
    const cells = releaseCells(
      release({ consensusStatus: "UNVERIFIED", expected: "2.3%" }),
      "INFLATION",
    );
    for (const key of ["actual", "prior"] as const) {
      const c = cells.find((cell) => cell.key === key)!;
      expect(c.provenance).toBeNull();
      expect(c.direction).toBeNull();
      expect(c.tone).toBe("neutral");
      expect(c.note).toBeNull();
    }
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

describe("surpriseDirection", () => {
  it("reads direction through higherIsBetter, never through raw magnitude", () => {
    // FED is higherIsBetter: false — a hike above consensus is a hawkish
    // surprise, so the larger number is the unfavourable one.
    expect(surpriseDirection(0.25, false)).toBe("negative");
    expect(surpriseDirection(-0.25, false)).toBe("positive");
    // JOBS is higherIsBetter: true — the same sign flips meaning.
    expect(surpriseDirection(0.25, true)).toBe("positive");
    expect(surpriseDirection(-0.25, true)).toBe("negative");
  });

  it("separates a measured zero from an absent surprise", () => {
    expect(surpriseDirection(0, true)).toBe("neutral");
    expect(surpriseDirection(null, true)).toBeNull();
    expect(surpriseDirection(Number.NaN, true)).toBeNull();
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
