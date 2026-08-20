import {
  CONSENSUS_EXPLANATIONS,
  TONE_TEXT_CLASS,
  releaseCells,
  type ReleaseCell,
} from "@/services/events/releaseView";
import {
  formatNewYorkDateTime,
  formatReferencePeriod,
} from "@/services/events/timing";
import { ConsensusBadge } from "./StatusBadges";
import type { DataReleaseView, EventCategory } from "@/types/events";

/**
 * Expectation versus reality for one macro release.
 *
 * Two variants over one derivation (`services/events/releaseView.ts`) so the
 * feed and the detail page cannot disagree about what a missing consensus looks
 * like. Every absent value renders the word *Unavailable* plus the reason it is
 * absent; none of them renders a zero, a dash-only cell, or a blank.
 *
 * Most rows in the library have no consensus at all — FRED and BLS publish
 * actuals only — so "Unavailable" is the normal state here, not an error, and
 * it is styled as a deliberate answer rather than as a failure.
 */

interface GridProps {
  release: DataReleaseView;
  category: EventCategory;
}

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
      className="rounded-lg border border-white/[0.07] bg-white/[0.015]"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white/[0.06] px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h3 className="font-mono text-[13px] font-semibold text-zinc-100">
            {release.metricName}
          </h3>
          {reference !== null && (
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Reference period {reference}
            </p>
          )}
        </div>
        <ConsensusBadge
          status={release.consensusStatus}
          title={CONSENSUS_EXPLANATIONS[release.consensusStatus]}
        />
      </header>

      <dl className="grid grid-cols-2 gap-px bg-white/[0.06] sm:grid-cols-4">
        {cells.map((cell) => (
          <ValueCell key={cell.key} cell={cell} />
        ))}
      </dl>

      {hasProvenance && (
        <footer className="flex flex-wrap gap-x-5 gap-y-1 border-t border-white/[0.06] px-4 py-2.5 text-[11px] text-zinc-500 sm:px-5">
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

function ValueCell({ cell }: { cell: ReleaseCell }) {
  const measured = cell.value !== null;
  return (
    <div className="bg-[#080C10] px-4 py-3 sm:px-5 sm:py-4">
      <dt className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
        {cell.label}
      </dt>
      <dd
        className={`mt-1.5 font-mono text-xl font-semibold tabular-nums sm:text-2xl ${
          measured ? TONE_TEXT_CLASS[cell.tone] : "text-zinc-600"
        }`}
      >
        {measured ? (
          cell.value
        ) : (
          <span className="text-base font-medium sm:text-lg">Unavailable</span>
        )}
      </dd>
      {(cell.absenceReason ?? cell.note) !== null && (
        <p
          className={`mt-1 text-[11px] leading-snug ${
            cell.note !== null ? "text-amber-300/70" : "text-zinc-600"
          }`}
        >
          {cell.note ?? cell.absenceReason}
        </p>
      )}
    </div>
  );
}

/* ──────────────────────────── compact variant ────────────────────────── */

/**
 * The feed's condensed form: the same four values on one scannable line.
 * "Unavailable" is abbreviated to "n/a" here for density, but it is still a
 * word rather than a number, and it still never appears as 0.
 */
export function ReleaseValueInline({ release, category }: GridProps) {
  const cells = releaseCells(release, category);
  return (
    <dl className="grid grid-cols-4 gap-2" aria-label={`${release.metricName} values`}>
      {cells.map((cell) => (
        <div key={cell.key} className="min-w-0">
          <dt className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
            {cell.label}
          </dt>
          <dd
            className={`truncate font-mono text-[13px] font-semibold tabular-nums ${
              cell.value === null ? "text-zinc-600" : TONE_TEXT_CLASS[cell.tone]
            }`}
            title={cell.value ?? cell.absenceReason ?? undefined}
          >
            {cell.value ?? <span className="text-[11px] font-medium">n/a</span>}
          </dd>
        </div>
      ))}
    </dl>
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
        <span className="text-zinc-400">{source}</span>
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="text-zinc-300 underline decoration-white/20 underline-offset-2 transition hover:text-zinc-100"
        >
          {source}
        </a>
      )}
    </span>
  );
}
