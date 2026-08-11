import { describe, expect, it } from "vitest";

import { planReactionRepair } from "@/services/events/reactionRepair";
import { CURRENT_REACTION_CALCULATION_VERSION } from "@/services/events/timing";

const trustedTiming = {
  releaseAt: new Date("2025-05-13T12:30:00Z"),
  timingStatus: "SCHEDULED" as const,
  timingSource: "BLS official release calendar",
};

describe("planReactionRepair", () => {
  it("deletes every reaction when release timing is untrusted", () => {
    const plan = planReactionRepair({
      ...trustedTiming,
      releaseAt: null,
      timingStatus: "REFERENCE_PERIOD_ONLY",
      reactions: [
        { id: "a", assetSymbol: "SPY", calculationVersion: null },
        {
          id: "b",
          assetSymbol: "TLT",
          calculationVersion: CURRENT_REACTION_CALCULATION_VERSION,
        },
      ],
    });

    expect(plan.reason).toBe("untrusted_timing");
    expect(plan.deleteRows.map((row) => row.id)).toEqual(["a", "b"]);
    expect(plan.recomputeAfterDelete).toBe(false);
  });

  it("selects only stale calculation versions on a trusted event", () => {
    const plan = planReactionRepair({
      ...trustedTiming,
      reactions: [
        { id: "legacy", assetSymbol: "SPY", calculationVersion: null },
        {
          id: "current",
          assetSymbol: "TLT",
          calculationVersion: CURRENT_REACTION_CALCULATION_VERSION,
        },
      ],
    });

    expect(plan.reason).toBe("legacy_calculation");
    expect(plan.deleteRows.map((row) => row.id)).toEqual(["legacy"]);
    expect(plan.recomputeAfterDelete).toBe(true);
  });

  it("is a no-op after affected rows have already been removed", () => {
    const first = planReactionRepair({
      ...trustedTiming,
      reactions: [
        { id: "legacy", assetSymbol: "SPY", calculationVersion: 0 },
        {
          id: "current",
          assetSymbol: "TLT",
          calculationVersion: CURRENT_REACTION_CALCULATION_VERSION,
        },
      ],
    });
    const remaining = [
      {
        id: "current",
        assetSymbol: "TLT",
        calculationVersion: CURRENT_REACTION_CALCULATION_VERSION,
      },
    ];
    const second = planReactionRepair({
      ...trustedTiming,
      reactions: remaining,
    });

    expect(first.deleteRows).toHaveLength(1);
    expect(second).toMatchObject({
      reason: null,
      deleteRows: [],
      recomputeAfterDelete: false,
    });
  });
});
