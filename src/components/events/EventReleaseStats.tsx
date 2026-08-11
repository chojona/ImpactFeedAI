import { CATEGORY_CONFIG } from "@/lib/eventCategories";
import {
  formatNewYorkDateTime,
  formatReferencePeriod,
} from "@/services/events/timing";
import type { DataReleaseView, EventCategory } from "@/types/events";

/**
 * Expectation vs. reality for a macro release.
 *
 * Surprise direction comes from `CATEGORY_CONFIG[category].higherIsBetter`,
 * never from a raw `actual > expected` comparison: a CPI print above consensus
 * is a *negative* surprise for risk assets even though the number is larger.
 *
 * Every cell renders "—" when the underlying column is null. Most rows in the
 * library have no consensus at all — FRED and BLS publish actuals only — so a
 * missing expectation is the normal case, not an error state.
 */

const surpriseToneClass = (
  surpriseValue: number | null,
  higherIsBetter: boolean,
): string => {
  if (surpriseValue === null || surpriseValue === 0) return "text-zinc-300";
  const isPositive = higherIsBetter ? surpriseValue > 0 : surpriseValue < 0;
  return isPositive ? "text-[#00FF94]" : "text-red-400";
};

interface Props {
  release: DataReleaseView;
  category: EventCategory;
  compact?: boolean;
}

export function EventReleaseStats({ release, category, compact = false }: Props) {
  const { higherIsBetter } = CATEGORY_CONFIG[category];
  const verifiedTone = surpriseToneClass(
    release.surpriseValue,
    higherIsBetter,
  );
  const tone =
    release.consensusStatus === "VERIFIED"
      ? verifiedTone
      : release.consensusStatus === "UNVERIFIED"
        ? "text-amber-300"
        : undefined;
  const reference = formatReferencePeriod(release.referencePeriodStart);
  const consensusAsOf = formatNewYorkDateTime(release.consensusAsOf);
  const consensusLabel =
    release.consensusStatus === "VERIFIED"
      ? "Consensus verified"
      : release.consensusStatus === "UNVERIFIED"
        ? "Consensus unverified"
        : "Consensus missing";
  const consensusTone =
    release.consensusStatus === "VERIFIED"
      ? "text-[#00FF94]"
      : release.consensusStatus === "UNVERIFIED"
        ? "text-amber-300"
        : "text-zinc-500";

  const cells: { label: string; value: string | null; tone?: string }[] = [
    { label: "Consensus", value: release.expected },
    { label: "Actual", value: release.actual, tone },
    { label: "Prior", value: release.prior },
    { label: "Surprise", value: release.surprise, tone },
  ];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {!compact && (
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            {release.metricName}
            {reference !== null && (
              <span className="ml-2 normal-case tracking-normal text-zinc-600">
                reference {reference}
              </span>
            )}
          </div>
        )}
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider ${consensusTone}`}
        >
          {consensusLabel}
        </span>
      </div>
      <div
        className={`flex flex-wrap ${compact ? "gap-1.5" : "gap-2"}`}
        role="group"
        aria-label={`${release.metricName} release values`}
      >
        {cells.map(({ label, value, tone: cellTone }) => (
          <span
            key={label}
            className={`rounded-full bg-zinc-800/60 text-zinc-400 ${
              compact ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm"
            }`}
          >
            {label}
            <span
              className={`ml-2 font-mono font-semibold ${
                value === null ? "text-zinc-600" : (cellTone ?? "text-zinc-300")
              }`}
            >
              {value ?? "—"}
            </span>
          </span>
        ))}
      </div>
      {!compact &&
        (release.actualSource !== null ||
          release.consensusSource !== null ||
          consensusAsOf !== null) && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
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
            {consensusAsOf !== null && <span>Consensus as of {consensusAsOf}</span>}
          </div>
        )}
    </div>
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
      {label} source: {" "}
      {href === null ? (
        source
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="text-zinc-300 hover:underline"
        >
          {source}
        </a>
      )}
    </span>
  );
}
