import { describe, expect, it } from "vitest";

import { planReactionRepair } from "@/services/events/reactionRepair";
import {
  ARCHIVED_ASSET_REACTION_VERSION,
  CURRENT_REACTION_CALCULATION_VERSION,
} from "@/services/events/timing";

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
          calculationVersion: ARCHIVED_ASSET_REACTION_VERSION,
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
          id: "archived",
          assetSymbol: "TLT",
          calculationVersion: ARCHIVED_ASSET_REACTION_VERSION,
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
          id: "archived",
          assetSymbol: "TLT",
          calculationVersion: ARCHIVED_ASSET_REACTION_VERSION,
        },
      ],
    });
    const remaining = [
      {
        id: "archived",
        assetSymbol: "TLT",
        calculationVersion: ARCHIVED_ASSET_REACTION_VERSION,
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

/**
 * Regression coverage for the v2-archive trap: introducing v3
 * (`reaction_measurements`) must not turn the 240 surviving v2
 * `asset_reactions` rows into repair-script deletion candidates. See
 * docs/superpowers/specs/2026-09-12-reaction-measurement-contract-design.md
 * §5.1.
 */
describe("v2 archive rows survive the v3 version bump", () => {
  it("separates the archive version from the current version", () => {
    expect(ARCHIVED_ASSET_REACTION_VERSION).toBe(2);
    expect(CURRENT_REACTION_CALCULATION_VERSION).toBe(3);
    expect(ARCHIVED_ASSET_REACTION_VERSION).not.toBe(
      CURRENT_REACTION_CALCULATION_VERSION,
    );
  });

  it("does not mark a v2 archive row as a deletion candidate", () => {
    // The whole point: bumping the current version to 3 must not turn 240
    // rows of valuable production history into repair-script deletion
    // candidates.
    const plan = planReactionRepair({
      ...trustedTiming,
      reactions: [
        {
          id: "r1",
          assetSymbol: "SPY",
          calculationVersion: ARCHIVED_ASSET_REACTION_VERSION,
        },
      ],
    });
    expect(plan.deleteRows).toEqual([]);
    expect(plan.reason).toBeNull();
    expect(plan.recomputeAfterDelete).toBe(false);
  });

  it("still marks a genuinely pre-versioning row as legacy", () => {
    const plan = planReactionRepair({
      ...trustedTiming,
      reactions: [{ id: "r0", assetSymbol: "SPY", calculationVersion: null }],
    });
    expect(plan.deleteRows).toHaveLength(1);
    expect(plan.reason).toBe("legacy_calculation");
  });

  it("does not compare against CURRENT_REACTION_CALCULATION_VERSION at all", () => {
    // A row stamped with the *current* v3 constant should never appear in
    // asset_reactions in practice, but if one did, this proves the repair
    // script's predicate is bound to the archive version, not the current one.
    const plan = planReactionRepair({
      ...trustedTiming,
      reactions: [
        {
          id: "would-be-v3",
          assetSymbol: "SPY",
          calculationVersion: CURRENT_REACTION_CALCULATION_VERSION,
        },
      ],
    });
    expect(plan.deleteRows).toHaveLength(1);
    expect(plan.reason).toBe("legacy_calculation");
  });
});
