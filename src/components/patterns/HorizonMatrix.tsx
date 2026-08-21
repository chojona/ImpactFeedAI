import Link from "next/link";

import {
  MIN_AGGREGATE_SAMPLE,
  type AssetProfile,
  type HorizonStats,
} from "@/services/analytics/patternAnalysis";
import {
  REACTION_WINDOWS,
  WINDOW_DESCRIPTIONS,
  WINDOW_LABELS,
  formatPercentChange,
} from "@/services/events/reactionView";
import { InstrumentBadge } from "@/components/ui/CategoryBadge";
import { ScrollableTable } from "@/components/ui/ScrollableTable";
import { moveColor, moveTextClass } from "@/components/reactions/reactionTone";
import type { ReactionWindow } from "@/types/events";

/**
 * Typical historical reaction per instrument, per horizon.
 *
 * Reports the **median**, not the mean: at these sample sizes one outlier
 * session moves a mean somewhere the data does not support. The mean is still
 * available in the cell's tooltip for anyone who wants it.
 *
 * Every cell carries its own sample size, because the sample size is the
 * finding. A category with six one-day observations and two one-week
 * observations is not "a pattern with a weaker weekly signal"; it is a pattern
 * measured twice at one week, and the row says so.
 *
 * Below {@link MIN_AGGREGATE_SAMPLE} observations the cell shows the individual
 * count rather than a "typical" reaction, so a two-event median is never
 * presented in the same voice as a sixty-event median.
 */

interface Props {
  assets: readonly AssetProfile[];
  /** Horizon the caller is emphasising; also drives the selectable link. */
  activeWindow: ReactionWindow;
  selectedSymbol?: string | null;
  hrefForSymbol?: (symbol: string) => string;
}

export function HorizonMatrix({
  assets,
  activeWindow,
  selectedSymbol = null,
  hrefForSymbol,
}: Props) {
  const scale = Math.max(
    1e-6,
    ...assets.flatMap((asset) =>
      REACTION_WINDOWS.map((w) => Math.abs(asset.horizons[w]?.median ?? 0)),
    ),
  );

  return (
    <ScrollableTable label="Median reaction by instrument and horizon">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <caption className="sr-only">
          Median percent change per instrument at each horizon, with the number
          of observations behind each figure.
        </caption>
        <thead>
          <tr className="border-b border-line-strong">
            <th
              scope="col"
              className="eyebrow sticky left-0 z-10 bg-surface-1 py-2 pr-3 text-left"
            >
              Instrument
            </th>
            {REACTION_WINDOWS.map((window) => (
              <th
                key={window}
                scope="col"
                title={`Median move ${WINDOW_DESCRIPTIONS[window]}`}
                className={`eyebrow py-2 pl-3 text-right ${
                  window === activeWindow ? "text-ink" : ""
                }`}
              >
                {WINDOW_LABELS[window]}
              </th>
            ))}
            <th scope="col" className="eyebrow py-2 pl-4 text-left">
              Observed range · {WINDOW_LABELS[activeWindow]}
            </th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => {
            const selected = asset.symbol === selectedSymbol;
            return (
              <tr
                key={asset.symbol}
                className={`group border-b border-line last:border-0 ${
                  selected ? "bg-surface-2" : "hover:bg-white/[0.02]"
                }`}
              >
                <th
                  scope="row"
                  className={`sticky left-0 z-10 py-2 pr-3 text-left font-normal ${
                    selected ? "bg-surface-2" : "bg-surface-1 group-hover:bg-surface-2"
                  }`}
                >
                  {hrefForSymbol ? (
                    <Link
                      href={hrefForSymbol(asset.symbol)}
                      scroll={false}
                      aria-current={selected ? "true" : undefined}
                      className="flex rounded"
                    >
                      <InstrumentBadge
                        symbol={asset.symbol}
                        name={asset.name}
                        emphasis={selected}
                      />
                    </Link>
                  ) : (
                    <InstrumentBadge
                      symbol={asset.symbol}
                      name={asset.name}
                      emphasis={selected}
                    />
                  )}
                </th>
                {REACTION_WINDOWS.map((window) => (
                  <MedianCell
                    key={window}
                    stats={asset.horizons[window]}
                    emphasised={window === activeWindow}
                  />
                ))}
                <td className="py-2 pl-4">
                  <RangeStrip
                    stats={asset.horizons[activeWindow]}
                    scale={scale}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollableTable>
  );
}

function MedianCell({
  stats,
  emphasised,
}: {
  stats: HorizonStats | null;
  emphasised: boolean;
}) {
  if (stats === null) {
    return (
      <td
        className="num py-2 pl-3 text-right text-[13px] text-ink-4"
        title="No observation at this horizon"
      >
        <span aria-label="no observation">—</span>
      </td>
    );
  }

  const thin = stats.count < MIN_AGGREGATE_SAMPLE;
  return (
    <td
      className={`num py-2 pl-3 text-right text-[13px] ${
        thin ? "text-ink-3" : moveTextClass(stats.median)
      } ${emphasised ? "font-semibold" : ""}`}
      title={`median ${formatPercentChange(stats.median)} · mean ${formatPercentChange(
        stats.mean,
      )} · ${stats.positive} up / ${stats.negative} down over ${stats.count} observations`}
    >
      {formatPercentChange(stats.median)}
      <span className="ml-1 text-[10px] font-normal text-ink-4">
        n={stats.count}
      </span>
    </td>
  );
}

/**
 * Min–max of the observations at the active horizon, with a median tick.
 *
 * Deliberately labelled "observed range" rather than anything statistical: over
 * four observations this is the range of four numbers, not a confidence
 * interval, and drawing it as one would be the exact overclaim the research
 * methodology warns against.
 */
function RangeStrip({
  stats,
  scale,
}: {
  stats: HorizonStats | null;
  scale: number;
}) {
  if (stats === null) {
    return <span className="text-[11px] text-ink-4">no observations</span>;
  }

  const toPct = (value: number): number =>
    50 + (Math.max(-scale, Math.min(scale, value)) / scale) * 50;
  const left = toPct(stats.min);
  const right = toPct(stats.max);

  return (
    <span
      className="flex items-center gap-2"
      title={`${formatPercentChange(stats.min)} to ${formatPercentChange(
        stats.max,
      )} over ${stats.count} observations`}
    >
      <span className="relative block h-4 w-full min-w-[90px] rounded-sm bg-white/[0.03]">
        <span
          aria-hidden
          className="absolute inset-y-0 left-1/2 w-px bg-line-strong"
        />
        <span
          aria-hidden
          className="absolute inset-y-[6px] rounded-full bg-white/25"
          style={{ left: `${left}%`, width: `${Math.max(right - left, 0.8)}%` }}
        />
        <span
          aria-hidden
          className="absolute inset-y-[2px] w-[2px] -translate-x-1/2 rounded-full"
          style={{
            left: `${toPct(stats.median)}%`,
            backgroundColor: moveColor(stats.median),
          }}
        />
      </span>
      <span className="num whitespace-nowrap text-[10px] text-ink-3">
        {formatPercentChange(stats.min)} … {formatPercentChange(stats.max)}
      </span>
    </span>
  );
}
