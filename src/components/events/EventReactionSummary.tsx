import { Activity } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { MetricCell, MetricRow } from "@/components/ui/Metric";
import { ReactionIndicator } from "@/components/reactions/ReactionIndicator";
import { directionOf } from "@/components/reactions/reactionTone";
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
 * This is the component the first audit was missing. Before it, the first
 * measured percentage on an event page sat roughly 900px below the fold, under a
 * candlestick chart — so the page opened with provenance metadata and the reader
 * had to scroll past a chart, find the horizon selector, and read a table before
 * learning whether anything moved.
 *
 * ### The hero treatment
 *
 * The second pass made it the visual centre of the product rather than one more
 * bordered rectangle. Three devices, in order of how much work they do:
 *
 *   1. **Directional tint and ring.** The whole block is faintly washed in the
 *      colour of the move and ringed in the same hue at low alpha. A reader
 *      knows the sign of the reaction from across the room, before reading a
 *      glyph or a digit.
 *   2. **Ambient illumination.** A single very faint radial in the same colour,
 *      set through `--ambient` on the `.ambient` class. It is what makes the
 *      panel look lit rather than filled, and it is the reason the tint can stay
 *      as low as 9–10% and still register.
 *   3. **Scale.** The percentage is set at 44/60px against 10px labels. Nothing
 *      else in the application is allowed near that size.
 *
 * The colour is *never* the only cue — the sign, the ▲/▼ glyph and the
 * spelled-out accessible name all still come from `ReactionIndicator`, so the
 * block survives greyscale and a screen reader. The `Activity` icon identifies
 * the block as "market reaction" and is deliberately not directional, so there
 * is exactly one arrow in the composition.
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

/**
 * Per-direction chrome. Kept as one table so the tint, the ring, the ambient
 * glow and the icon container can never drift out of agreement about which way
 * the market went — three of them are decorative and one of them is the fact.
 */
const DIRECTION_CHROME = {
  UP: {
    ring: "border-pos/30",
    wash: "bg-pos-tint",
    ambient: "rgba(0, 255, 148, 0.11)",
    iconTint: "border-pos/25 bg-pos/10 text-pos",
  },
  DOWN: {
    ring: "border-neg/30",
    wash: "bg-neg-tint",
    ambient: "rgba(255, 92, 92, 0.12)",
    iconTint: "border-neg/25 bg-neg/10 text-neg",
  },
  FLAT: {
    ring: "border-line-strong",
    wash: "bg-surface-1",
    ambient: "rgba(91, 124, 250, 0.13)",
    iconTint: "border-line-strong bg-surface-3 text-flat",
  },
} as const;

export function EventReactionSummary({
  summary,
}: {
  summary: ReactionSummary;
}) {
  const { window, strongest, benchmark } = summary;
  const partial = summary.measured < summary.total;
  const chrome = DIRECTION_CHROME[directionOf(strongest.value) ?? "FLAT"];

  return (
    <section
      aria-label="Market reaction summary"
      style={{ "--ambient": chrome.ambient } as React.CSSProperties}
      className={`ambient surface-lift overflow-hidden rounded-xl border ${chrome.ring} ${chrome.wash}`}
    >
      <div className="grid grid-cols-1 divide-y divide-line lg:grid-cols-12 lg:divide-x lg:divide-y-0">
        {/* Level 1. The single loudest thing in the application. */}
        <div className="px-5 py-6 sm:px-7 lg:col-span-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              aria-hidden
              className={`flex h-6 w-6 items-center justify-center rounded-md border ${chrome.iconTint}`}
            >
              <Activity className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
            <span className="eyebrow">Largest measured move</span>
            <Badge size="xs">{WINDOW_LABELS[window]}</Badge>
          </div>

          <div className="mt-4">
            <ReactionIndicator
              value={strongest.value}
              symbol={strongest.asset.symbol}
              windowLabel={WINDOW_DESCRIPTIONS[window]}
              size="hero"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="num text-[15px] font-semibold text-ink">
              {strongest.asset.symbol}
            </span>
            <span className="text-xs text-ink-3">{strongest.asset.name}</span>
          </div>

          <p className="mt-3 max-w-sm text-xs leading-relaxed text-ink-3">
            From the pre-release baseline bar, {WINDOW_DESCRIPTIONS[window]}.
          </p>
        </div>

        {/* Level 2. Supporting context, on a neutral surface so the directional
            tint stays attached to the figure it describes rather than washing
            the whole component. */}
        <div className="flex items-center bg-canvas/55 px-5 py-6 sm:px-7 lg:col-span-7">
          <MetricRow
            columns={3}
            aria-label="Reaction context"
            className="w-full"
          >
            <MetricCell
              label={`${BENCHMARK_SYMBOL} benchmark`}
              value={
                benchmark === null ? null : formatPercentChange(benchmark.value)
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
