/**
 * Presentation logic for a macro release's four headline values.
 *
 * One definition, shared by the feed card and the event detail page, so the two
 * surfaces cannot drift on the question this module exists to answer: **what
 * does an absent value look like?**
 *
 * Every cell distinguishes three states that a naive renderer collapses into
 * one blank box:
 *
 *   - measured   — the database holds a number; show it in its canonical unit
 *   - unavailable — the database holds null; say so, and say why
 *   - unverified  — a number exists but its provenance does not support calling
 *                   it consensus; show it, flagged
 *
 * A cell is never "0". `DataRelease.expectedValue = null` means nobody recorded
 * a forecast; rendering that as 0.0% would assert that the street expected a
 * zero print.
 */
import { CATEGORY_CONFIG } from "@/lib/eventCategories";
import type {
  ConsensusStatus,
  DataReleaseView,
  EventCategory,
} from "@/types/events";

export type ReleaseCellKey = "actual" | "consensus" | "prior" | "surprise";

/** Green/red carry interpretation, so they are applied deliberately. */
export type ValueTone = "neutral" | "positive" | "negative" | "caution";

export interface ReleaseCell {
  key: ReleaseCellKey;
  label: string;
  /** Formatted value in the metric's canonical unit, or null when absent. */
  value: string | null;
  /** Why the value is absent. Rendered instead of a blank. Null when present. */
  absenceReason: string | null;
  tone: ValueTone;
  /** Extra qualifier shown under the value, e.g. an unverified warning. */
  note: string | null;
}

export const CONSENSUS_LABELS: Record<ConsensusStatus, string> = {
  VERIFIED: "Consensus verified",
  UNVERIFIED: "Consensus unverified",
  MISSING: "Consensus unavailable",
};

export const CONSENSUS_EXPLANATIONS: Record<ConsensusStatus, string> = {
  VERIFIED:
    "The forecast carries a named source, a citation and an as-of instant recorded before the release.",
  UNVERIFIED:
    "A forecast value is stored without complete provenance, so it is not presented as market consensus.",
  MISSING:
    "No forecast was recorded for this release. FRED and BLS publish actuals only, so most historical rows have no consensus.",
};

/**
 * Surprise direction, from the category's `higherIsBetter` flag rather than a
 * raw `actual > expected` comparison: a CPI print above consensus is a negative
 * surprise for risk assets even though the number is larger.
 */
function surpriseTone(
  surpriseValue: number | null,
  consensusStatus: ConsensusStatus,
  higherIsBetter: boolean,
): ValueTone {
  if (surpriseValue === null) return "neutral";
  if (consensusStatus !== "VERIFIED") return "caution";
  if (surpriseValue === 0) return "neutral";
  const favourable = higherIsBetter ? surpriseValue > 0 : surpriseValue < 0;
  return favourable ? "positive" : "negative";
}

/**
 * The four headline cells in a fixed order. Order is deliberate: the printed
 * number first, then what it is being compared against.
 */
export function releaseCells(
  release: DataReleaseView,
  category: EventCategory,
): ReleaseCell[] {
  const { higherIsBetter } = CATEGORY_CONFIG[category];
  const tone = surpriseTone(
    release.surpriseValue,
    release.consensusStatus,
    higherIsBetter,
  );
  const unverifiedConsensus = release.consensusStatus === "UNVERIFIED";

  return [
    {
      key: "actual",
      label: "Actual",
      value: release.actual,
      absenceReason: release.actual === null ? "No actual recorded" : null,
      tone: "neutral",
      note: null,
    },
    {
      key: "consensus",
      label: "Consensus",
      value: release.expected,
      absenceReason: release.expected === null ? "No forecast source" : null,
      tone: unverifiedConsensus ? "caution" : "neutral",
      note: unverifiedConsensus && release.expected !== null ? "Unverified" : null,
    },
    {
      key: "prior",
      label: "Previous",
      value: release.prior,
      absenceReason: release.prior === null ? "No prior observation" : null,
      tone: "neutral",
      note: null,
    },
    {
      key: "surprise",
      label: "Surprise",
      value: release.surprise,
      absenceReason:
        release.surprise === null
          ? release.consensusStatus === "MISSING"
            ? "Requires a consensus"
            : "Not computable"
          : null,
      tone,
      note: unverifiedConsensus && release.surprise !== null ? "Unverified" : null,
    },
  ];
}

/**
 * Whether a release has anything worth rendering. A row where every value is
 * null still carries a metric name and a reference period, but it has no
 * numbers, and a grid of four "Unavailable" cells is noise rather than
 * information.
 */
export const releaseHasAnyValue = (release: DataReleaseView): boolean =>
  release.actual !== null ||
  release.expected !== null ||
  release.prior !== null ||
  release.surprise !== null;

export const TONE_TEXT_CLASS: Record<ValueTone, string> = {
  neutral: "text-zinc-100",
  positive: "text-[#00FF94]",
  negative: "text-[#FF5C5C]",
  caution: "text-amber-300",
};
