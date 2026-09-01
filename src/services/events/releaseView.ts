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
 *
 * Two axes, not one. **Direction** is what a number means (`SurpriseDirection`,
 * read through the category's `higherIsBetter` flag) and **provenance** is how
 * well-sourced the consensus behind it is (`CellProvenance`). They were
 * previously collapsed into a single tone, which made an unverified forecast
 * silence the direction entirely; they are now reported separately and combined
 * into a colour only at the last step, so a reader can learn that a print beat
 * expectations *and* that those expectations are unverified.
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

/**
 * What the number *means*, in the category's own terms.
 *
 * Independent of how well-sourced it is. `neutral` is a measured zero — a print
 * exactly on consensus — and is not the same answer as `null`, which is "there
 * is no direction to state here".
 */
export type SurpriseDirection = "positive" | "negative" | "neutral";

/**
 * How well-sourced the consensus a cell depends on is.
 *
 * Deliberately a second axis rather than a third value on the first one. The
 * previous model folded provenance into the tone, so an unverified consensus
 * suppressed the direction entirely: with 20 of the library's 21 releases
 * carrying `UNVERIFIED`, effectively every surprise in the product rendered
 * amber and *no* beat or miss was ever shown, even where both the actual and
 * the forecast were known. "We are not sure where the forecast came from" is
 * not the same statement as "we cannot tell you whether this printed hot".
 */
export type CellProvenance = "verified" | "unverified" | "missing";

export interface ReleaseCell {
  key: ReleaseCellKey;
  label: string;
  /** Formatted value in the metric's canonical unit, or null when absent. */
  value: string | null;
  /** Why the value is absent. Rendered instead of a blank. Null when present. */
  absenceReason: string | null;
  /**
   * Interpretation of the value. Null on cells that carry no direction at all —
   * a printed actual is neither good nor bad without something to compare it
   * against, which is the comparison the surprise cell exists to make.
   */
  direction: SurpriseDirection | null;
  /**
   * Provenance of the consensus this cell depends on. Null on cells that do not
   * depend on one, so a caller can tell "verified" from "not applicable".
   */
  provenance: CellProvenance | null;
  /** Display tone, derived from the two axes above. See `displayTone`. */
  tone: ValueTone;
  /** Extra qualifier shown under the value, e.g. an unverified warning. */
  note: string | null;
}

/** The note that marks a value as depending on an unverified consensus. */
export const UNVERIFIED_CONSENSUS_NOTE = "Unverified consensus";

/**
 * The marker an inline, single-line rendering puts on such a value, where there
 * is no room for the note. Paired with one footnote per release, never used as
 * the only signal — the footnote spells it out and the title attribute explains
 * it.
 */
export const UNVERIFIED_CONSENSUS_MARKER = "†";

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

const PROVENANCE: Record<ConsensusStatus, CellProvenance> = {
  VERIFIED: "verified",
  UNVERIFIED: "unverified",
  MISSING: "missing",
};

/**
 * Surprise direction, from the category's `higherIsBetter` flag rather than a
 * raw `actual > expected` comparison: a CPI print above consensus is a negative
 * surprise for risk assets even though the number is larger. "Higher" is never
 * treated as inherently good — the flag is the only input that decides which
 * side of zero is favourable.
 *
 * Provenance is deliberately not an argument. Where the surprise was computed,
 * its direction follows from arithmetic the consensus's paperwork cannot
 * change; how much that consensus can be trusted is reported separately.
 */
export function surpriseDirection(
  surpriseValue: number | null,
  higherIsBetter: boolean,
): SurpriseDirection | null {
  if (surpriseValue === null || !Number.isFinite(surpriseValue)) return null;
  if (surpriseValue === 0) return "neutral";
  const favourable = higherIsBetter ? surpriseValue > 0 : surpriseValue < 0;
  return favourable ? "positive" : "negative";
}

/**
 * One colour out of two independent facts.
 *
 * Green and red keep their existing meaning — the direction of the data, not a
 * status — so a known direction always claims the colour. Amber is what is left
 * for provenance, and it is used only where there is no direction competing for
 * the same pixel: an unverified forecast value, or a surprise that is exactly
 * zero. Everywhere else provenance travels as a word (`note`) or a marker, so
 * both facts arrive at once instead of one silencing the other.
 */
function displayTone(
  direction: SurpriseDirection | null,
  provenance: CellProvenance | null,
): ValueTone {
  if (direction === "positive" || direction === "negative") return direction;
  return provenance === "unverified" ? "caution" : "neutral";
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
  const provenance = PROVENANCE[release.consensusStatus];
  const direction = surpriseDirection(release.surpriseValue, higherIsBetter);
  const unverifiedConsensus = provenance === "unverified";

  return [
    {
      key: "actual",
      label: "Actual",
      value: release.actual,
      absenceReason: release.actual === null ? "No actual recorded" : null,
      direction: null,
      provenance: null,
      tone: "neutral",
      note: null,
    },
    {
      key: "consensus",
      label: "Consensus",
      value: release.expected,
      absenceReason: release.expected === null ? "No forecast source" : null,
      // The forecast itself has no direction; amber is free to carry provenance.
      direction: null,
      provenance,
      tone: displayTone(null, provenance),
      note:
        unverifiedConsensus && release.expected !== null
          ? UNVERIFIED_CONSENSUS_NOTE
          : null,
    },
    {
      key: "prior",
      label: "Previous",
      value: release.prior,
      absenceReason: release.prior === null ? "No prior observation" : null,
      direction: null,
      provenance: null,
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
      // Both axes at once: the colour says which way the print went, the note
      // says how far the forecast it is measured against can be trusted.
      direction,
      provenance,
      tone: displayTone(direction, provenance),
      note:
        unverifiedConsensus && release.surprise !== null
          ? UNVERIFIED_CONSENSUS_NOTE
          : null,
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
  neutral: "text-ink",
  positive: "text-pos",
  negative: "text-neg",
  caution: "text-warn",
};
