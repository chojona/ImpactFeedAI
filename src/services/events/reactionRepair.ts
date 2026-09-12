import {
  ARCHIVED_ASSET_REACTION_VERSION,
  reactionTimingEligibility,
  type ReactionTimingInput,
} from "@/services/events/timing";

export interface RepairableReaction {
  id: string;
  assetSymbol: string;
  calculationVersion: number | null;
}

export interface ReactionRepairInput extends ReactionTimingInput {
  reactions: readonly RepairableReaction[];
}

export type ReactionRepairReason =
  | "untrusted_timing"
  | "legacy_calculation";

export interface ReactionRepairPlan {
  timingEligible: boolean;
  reason: ReactionRepairReason | null;
  deleteRows: RepairableReaction[];
  /** True only when deleted rows can be rebuilt from a trusted release time. */
  recomputeAfterDelete: boolean;
}

/**
 * Produce the deterministic, side-effect-free part of a reaction repair.
 *
 * A second planning pass after the selected rows have been deleted returns an
 * empty plan. That property is what makes the destructive CLI safe to resume:
 * it never broadens its scope or guesses which unrelated rows to rewrite.
 *
 * Compares against {@link ARCHIVED_ASSET_REACTION_VERSION}, not the current
 * (v3) calculation version — `asset_reactions` is a frozen v2 archive, and a
 * row already stamped with the archive version is not "legacy": it is exactly
 * what a correct v2 write looks like. Binding this to the current version
 * would reclassify every surviving row as a deletion candidate the moment a
 * newer calculation version was introduced elsewhere in the product.
 */
export function planReactionRepair(
  input: ReactionRepairInput,
): ReactionRepairPlan {
  const timing = reactionTimingEligibility(input);
  const deleteRows = timing.eligible
    ? input.reactions.filter(
        (row) => row.calculationVersion !== ARCHIVED_ASSET_REACTION_VERSION,
      )
    : [...input.reactions];

  return {
    timingEligible: timing.eligible,
    reason:
      deleteRows.length === 0
        ? null
        : timing.eligible
          ? "legacy_calculation"
          : "untrusted_timing",
    deleteRows,
    recomputeAfterDelete: timing.eligible && deleteRows.length > 0,
  };
}
