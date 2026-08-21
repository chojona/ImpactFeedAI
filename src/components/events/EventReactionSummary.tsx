import { InstrumentBadge } from "@/components/ui/CategoryBadge";
import { MetricCell, MetricRow } from "@/components/ui/Metric";
import { ReactionIndicator } from "@/components/reactions/ReactionIndicator";
import {
  REACTION_WINDOWS,
  WINDOW_DESCRIPTIONS,
  WINDOW_LABELS,
  formatPercentChange,
  pctForWindow,
  rankByWindow,
} from "@/services/events/reactionView";
import type { AssetReaction, ReactionWindow } from "@/types/events";

/**
 * The five-second answer to "what did the market do".
 *
 * This is the component the audit was missing. Before it, the first measured
 * percentage on an event page sat roughly 900px below the fold, under a
 * candlestick chart — so the page opened with provenance metadata and the
 * reader had to scroll past a chart, find the horizon selector, and read a
 * table before learning whether anything moved. Meanwhile the *headline*
 * position was occupied by a paragraph explaining the timing source.
 *
 * Everything here is derived from the `AssetReaction[]` the page already holds,
 * so it costs no query and no client JavaScript. Nothing is interpolated: the
 * headline window is the first horizon that actually has readings, and it is
 * named in the eyebrow rather than assumed, because an event with a one-hour
 * reading and no one-session reading is a different finding from one with both.
 *
 * The benchmark cell is fixed to SPY and rendered as *absent* rather than
 * substituted when SPY has no reading — swapping in QQQ to fill the slot would
 * silently change what "benchmark" means between two events.
 */

const BENCHMARK_SYMBOL = "SPY";

/** Order of preference for the headline. `1d` is the horizon the app quotes. */
const HEADLINE_PREFERENCE: readonly ReactionWindow[] = ["1d", "1h", "1w"];

export interface ReactionSummary {
  window: ReactionWindow;
  strongest: { asset: AssetReaction; value: number };
  benchmark: { asset: AssetReaction; value: number | null } | null;
  measured: number;
  total: number;
  up: number;
  down: number;
  flat: number;
  /** Horizons with at least one reading anywhere in the set. */
  measuredWindows: ReactionWindow[];
}

/**
 * Null when no instrument has a reading at any horizon — the caller then owns
 * the empty state, because *why* it is empty is a page-level fact (untrusted
 * timing versus a missing backfill) that this component cannot see.
 */
export function summarizeReaction(
  assets: readonly AssetReaction[],
): ReactionSummary | null {
  if (assets.length === 0) return null;

  const measuredWindows = REACTION_WINDOWS.filter((window) =>
    assets.some((asset) => pctForWindow(asset, window) !== null),
  );
  if (measuredWindows.length === 0) return null;

  const window =
    HEADLINE_PREFERENCE.find((candidate) =>
      measuredWindows.includes(candidate),
    ) ?? measuredWindows[0];

  const { measured } = rankByWindow(assets, window);
  const strongest = measured[0];
  if (strongest === undefined) return null;

  const benchmarkAsset = assets.find((a) => a.symbol === BENCHMARK_SYMBOL);

  return {
    window,
    strongest,
    benchmark:
      benchmarkAsset === undefined
        ? null
        : {
            asset: benchmarkAsset,
            value: pctForWindow(benchmarkAsset, window),
          },
    measured: measured.length,
    total: assets.length,
    up: measured.filter((r) => r.value > 0).length,
    down: measured.filter((r) => r.value < 0).length,
    flat: measured.filter((r) => r.value === 0).length,
    measuredWindows,
  };
}

export function EventReactionSummary({
  summary,
}: {
  summary: ReactionSummary;
}) {
  const { window, strongest, benchmark } = summary;
  const partial = summary.measured < summary.total;

  return (
    <section
      aria-label="Market reaction summary"
      className="rounded-lg border border-line bg-surface-1"
    >
      <div className="grid grid-cols-1 divide-y divide-line lg:grid-cols-12 lg:divide-x lg:divide-y-0">
        {/* Level 1. The single loudest thing on the page. */}
        <div className="px-5 py-5 sm:px-6 lg:col-span-5">
          <p className="eyebrow">
            Largest measured move · {WINDOW_LABELS[window]}
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1">
            <ReactionIndicator
              value={strongest.value}
              symbol={strongest.asset.symbol}
              windowLabel={WINDOW_DESCRIPTIONS[window]}
              size="xl"
            />
            <InstrumentBadge
              symbol={strongest.asset.symbol}
              name={strongest.asset.name}
              className="pb-1"
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-3">
            From the pre-release baseline bar, {WINDOW_DESCRIPTIONS[window]}.
          </p>
        </div>

        {/* Level 2. Supporting context for the headline. */}
        <div className="flex items-center px-5 py-5 sm:px-6 lg:col-span-7">
          <MetricRow columns={3} aria-label="Reaction context" className="w-full">
            <MetricCell
              label={`${BENCHMARK_SYMBOL} benchmark`}
              value={
                benchmark === null
                  ? null
                  : formatPercentChange(benchmark.value)
              }
              size="md"
              tone={
                benchmark?.value === null || benchmark === null
                  ? "neutral"
                  : benchmark.value > 0
                    ? "positive"
                    : benchmark.value < 0
                      ? "negative"
                      : "neutral"
              }
              state="unavailable"
              absenceLabel={
                benchmark === null ? "Not in universe" : "Not measured"
              }
              unit={WINDOW_LABELS[window]}
              note={benchmark === null ? undefined : benchmark.asset.name}
            />

            <MetricCell
              label="Direction breadth"
              value={`${summary.up}↑ ${summary.down}↓`}
              size="md"
              state="measured"
              note={
                summary.flat > 0
                  ? `${summary.flat} unchanged · of ${summary.measured} measured`
                  : `of ${summary.measured} measured`
              }
            />

            <MetricCell
              label="Coverage"
              value={`${summary.measured}/${summary.total}`}
              size="md"
              tone={partial ? "caution" : "neutral"}
              state="measured"
              note={
                <>
                  instruments ·{" "}
                  <span className="num">
                    {summary.measuredWindows
                      .map((w) => WINDOW_LABELS[w])
                      .join(" ")}
                  </span>{" "}
                  stored
                </>
              }
              noteTone={partial ? "caution" : "muted"}
            />
          </MetricRow>
        </div>
      </div>
    </section>
  );
}
