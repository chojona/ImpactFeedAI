import { MetricCell } from "@/components/ui/Metric";
import {
  CONSENSUS_EXPLANATIONS,
  CONSENSUS_LABELS,
  TONE_TEXT_CLASS,
  UNVERIFIED_CONSENSUS_MARKER,
  releaseCells,
  type ReleaseCell,
  type ReleaseCellKey,
} from "@/services/events/releaseView";
import {
  formatNewYorkDateTime,
  formatReferencePeriod,
} from "@/services/events/timing";
import { ConsensusBadge } from "./StatusBadges";
import type { DataReleaseView, EventCategory } from "@/types/events";
import type { MetricSize, MetricTone } from "@/components/ui/Metric";

/**
 * Expectation versus reality for one macro release.
 *
 * Two variants over one derivation (`services/events/releaseView.ts`) so the
 * feed and the detail page cannot disagree about what a missing consensus looks
 * like. Every absent value renders a *word* plus the reason it is absent; none
 * of them renders a zero, a dash-only cell, or a blank.
 *
 * The redesign adds hierarchy *within* the release. All four values used to be
 * set at the same size, which gave equal billing to the printed number and to
 * the reason a forecast is missing. Now `Actual` and `Surprise` carry the large
 * treatment — they are the two figures the research thesis is built on — and
 * `Consensus` and `Previous` sit a step down as the things being compared
 * against. Absence still reads at a smaller size than a present value, so a
 * column of "Unavailable" cannot be mistaken for a column of data.
 *
 * Most rows in the library have no consensus at all — FRED and BLS publish
 * actuals only — so "Unavailable" is the normal state here, not an error, and
 * it is styled as a deliberate answer rather than as a failure.
 *
 * Direction and provenance are rendered on two channels. Green/red is the
 * direction of the print, read through the category's `higherIsBetter` flag;
 * amber — a note in the grid, a dagger plus a footnote inline — is the state of
 * the consensus it was measured against. A surprise whose consensus is
 * unverified therefore shows its direction *and* its caveat, instead of the
 * caveat erasing the direction.
 */

interface GridProps {
  release: DataReleaseView;
  category: EventCategory;
}

/** The two figures the thesis rests on get the loud treatment. */
const CELL_SIZE: Record<ReleaseCellKey, MetricSize> = {
  actual: "lg",
  consensus: "md",
  prior: "md",
  surprise: "lg",
};

const TONE: Record<ReleaseCell["tone"], MetricTone> = {
  neutral: "neutral",
  positive: "positive",
  negative: "negative",
  caution: "caution",
};

export function ReleaseValueGrid({ release, category }: GridProps) {
  const cells = releaseCells(release, category);
  const reference = formatReferencePeriod(release.referencePeriodStart);
  const consensusAsOf = formatNewYorkDateTime(release.consensusAsOf);
  const hasProvenance =
    release.actualSource !== null ||
    release.consensusSource !== null ||
    consensusAsOf !== null;

  return (
    <section
      aria-label={`${release.metricName} release values`}
      className="overflow-hidden rounded-lg border border-line bg-surface-1"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h3 className="title-panel truncate">{release.metricName}</h3>
          {reference !== null && (
            <p className="mt-0.5 text-[11px] text-ink-4">
              Reference period {reference}
            </p>
          )}
        </div>
        <ConsensusBadge
          status={release.consensusStatus}
          title={CONSENSUS_EXPLANATIONS[release.consensusStatus]}
        />
      </header>

      <dl className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
        {cells.map((cell) => (
          <MetricCell
            key={cell.key}
            label={cell.label}
            value={cell.value}
            size={CELL_SIZE[cell.key]}
            tone={TONE[cell.tone]}
            state="unavailable"
            absenceLabel={cell.absenceReason ?? undefined}
            note={cell.note}
            noteTone={cell.note !== null ? "caution" : "muted"}
            className="border-b border-line px-4 py-4 last:border-b-0 sm:border-b-0 sm:px-5 sm:pl-5 sm:first:pl-5 [&:nth-last-child(2)]:border-b-0"
          />
        ))}
      </dl>

      {hasProvenance && (
        <footer className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line px-4 py-2.5 text-[11px] text-ink-4 sm:px-5">
          {release.actualSource !== null && (
            <SourceLine
              label="Actual"
              source={release.actualSource}
              href={release.actualSourceUrl}
            />
          )}
          {release.consensusSource !== null && (
            <SourceLine
              label="Consensus"
              source={release.consensusSource}
              href={release.consensusSourceUrl}
            />
          )}
          {consensusAsOf !== null && (
            <span>Consensus as of {consensusAsOf}</span>
          )}
        </footer>
      )}
    </section>
  );
}

/* ──────────────────────────── compact variant ────────────────────────── */

/**
 * The feed's condensed form: the same four values on one scannable line.
 * "Unavailable" is abbreviated to "n/a" here for density, but it is still a
 * word rather than a number, and it still never appears as 0.
 *
 * Provenance is carried on a separate channel from direction, because on a feed
 * card the two facts have to arrive together in about twenty pixels. The digits
 * keep the green/red of the *move*; an amber dagger marks each value that
 * depends on an unverified consensus, and one amber footnote under the row says
 * what the dagger means. Colour is never the only signal — the marker is a
 * glyph, the footnote is a sentence, and screen readers get the words inline.
 */
export function ReleaseValueInline({ release, category }: GridProps) {
  const cells = releaseCells(release, category);
  const unverified = cells.some(
    (cell) => cell.provenance === "unverified" && cell.value !== null,
  );

  return (
    <>
      <dl
        className="grid grid-cols-4 gap-x-2"
        aria-label={`${release.metricName} values`}
      >
        {cells.map((cell) => (
          <div key={cell.key} className="min-w-0">
            <dt className="eyebrow truncate text-[9px]">{cell.label}</dt>
            <dd
              className={`num mt-1 truncate text-[13px] font-semibold ${
                cell.value === null ? "text-ink-4" : TONE_TEXT_CLASS[cell.tone]
              }`}
              title={
                cell.value === null
                  ? (cell.absenceReason ?? undefined)
                  : cell.note === null
                    ? cell.value
                    : `${cell.value} — ${CONSENSUS_EXPLANATIONS.UNVERIFIED}`
              }
            >
              {cell.value ?? (
                <span className="text-[11px] font-medium">n/a</span>
              )}
              {cell.value !== null && cell.note !== null && (
                <>
                  <span aria-hidden className="align-super text-[9px] text-warn">
                    {UNVERIFIED_CONSENSUS_MARKER}
                  </span>
                  <span className="sr-only"> ({cell.note})</span>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {unverified && (
        <p
          className="mt-2 truncate font-mono text-[9px] uppercase tracking-[0.1em] text-warn/80"
          title={CONSENSUS_EXPLANATIONS.UNVERIFIED}
        >
          <span aria-hidden>{UNVERIFIED_CONSENSUS_MARKER} </span>
          {CONSENSUS_LABELS.UNVERIFIED}
        </p>
      )}
    </>
  );
}

function SourceLine({
  label,
  source,
  href,
}: {
  label: string;
  source: string;
  href: string | null;
}) {
  return (
    <span>
      {label} source:{" "}
      {href === null ? (
        <span className="text-ink-3">{source}</span>
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="rounded text-ink-3 underline decoration-line-strong underline-offset-2 transition-colors hover:text-ink"
        >
          {source}
        </a>
      )}
    </span>
  );
}
