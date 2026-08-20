import Link from "next/link";

import {
  median as medianOf,
  type DistributionPoint,
} from "@/services/analytics/patternAnalysis";
import { halfDomainFor } from "@/services/events/reactionChart";
import {
  WINDOW_DESCRIPTIONS,
  WINDOW_LABELS,
  formatPercentChange,
} from "@/services/events/reactionView";
import { moveColor } from "@/components/reactions/reactionTone";
import { formatNewYorkDate } from "@/services/events/timing";
import type { ReactionWindow } from "@/types/events";

/**
 * Every historical observation behind one aggregate, as a dot plot.
 *
 * One dot is one real event, and every dot links to it. That is the point: an
 * aggregate that cannot be traced back to the rows it came from is an assertion
 * rather than evidence, and at these sample sizes the individual events are
 * more informative than any summary of them.
 *
 * Deliberately *not* a smoothed density curve or a fitted normal. Both would
 * imply a population this data cannot characterise. The only derived mark is
 * the median, which is a real order statistic of the points shown.
 */

/** Dots closer together than this share a column and stack vertically. */
const COLLISION_PCT = 3;
const ROW_HEIGHT = 14;
const MAX_ROWS = 5;

interface Props {
  points: readonly DistributionPoint[];
  symbol: string;
  window: ReactionWindow;
}

export function ReactionDistribution({ points, symbol, window }: Props) {
  if (points.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.01] px-4 py-8 text-center text-sm text-zinc-500">
        No {symbol} observation at {WINDOW_LABELS[window]} in this category.
      </p>
    );
  }

  const values = points.map((p) => p.value);
  const halfDomain = halfDomainFor(values);
  const toPct = (value: number): number => 50 + (value / halfDomain) * 50;

  const med = medianOf(values);
  const up = values.filter((v) => v > 0).length;
  const down = values.filter((v) => v < 0).length;
  const flat = values.length - up - down;

  const placed = stack(points, toPct);
  const rows = Math.min(MAX_ROWS, Math.max(...placed.map((p) => p.row)) + 1);
  const plotHeight = rows * ROW_HEIGHT + 16;

  return (
    <figure>
      <div
        className="relative w-full rounded-lg border border-white/5 bg-white/[0.01]"
        style={{ height: `${plotHeight + 26}px` }}
      >
        <div aria-hidden className="absolute inset-x-0 top-0" style={{ height: `${plotHeight}px` }}>
          <span className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
          <span
            className="absolute inset-y-1 w-[2px] -translate-x-1/2 rounded-full opacity-70"
            style={{ left: `${toPct(med)}%`, backgroundColor: moveColor(med) }}
          />
        </div>

        {placed.map((point) => (
          <Link
            key={`${point.eventId}-${point.value}`}
            href={`/events/${point.eventId}`}
            title={`${point.title} — ${formatPercentChange(point.value)} at ${
              WINDOW_LABELS[window]
            }${formatNewYorkDate(point.at) === null ? "" : ` on ${formatNewYorkDate(point.at)}`}`}
            aria-label={`${point.title}, ${formatPercentChange(point.value)} at ${WINDOW_LABELS[window]}`}
            className="absolute z-10 -translate-x-1/2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF94]/50"
            style={{
              left: `${point.xPct}%`,
              top: `${8 + (point.row % MAX_ROWS) * ROW_HEIGHT}px`,
            }}
          >
            <span
              className="block h-2.5 w-2.5 rounded-full opacity-80 transition hover:scale-150 hover:opacity-100"
              style={{ backgroundColor: moveColor(point.value) }}
            />
          </Link>
        ))}

        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 flex justify-between px-2 font-mono text-[10px] tabular-nums text-zinc-600"
        >
          <span>−{halfDomain.toFixed(2)}%</span>
          <span>0%</span>
          <span>+{halfDomain.toFixed(2)}%</span>
        </div>
      </div>

      <figcaption className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-zinc-500">
        <span>
          <span className="font-mono tabular-nums text-zinc-300">
            {points.length}
          </span>{" "}
          observations
        </span>
        <span>
          median{" "}
          <span className="font-mono tabular-nums text-zinc-300">
            {formatPercentChange(med)}
          </span>
        </span>
        <span>
          <span className="font-mono tabular-nums text-[#00FF94]">{up}</span> up
          {" · "}
          <span className="font-mono tabular-nums text-[#FF5C5C]">{down}</span>{" "}
          down
          {flat > 0 && (
            <>
              {" · "}
              <span className="font-mono tabular-nums text-zinc-400">{flat}</span>{" "}
              unchanged
            </>
          )}
        </span>
        <span className="text-zinc-600">
          Each dot is one event {WINDOW_DESCRIPTIONS[window]}; select one to open it.
        </span>
      </figcaption>
    </figure>
  );
}

interface PlacedPoint extends DistributionPoint {
  xPct: number;
  row: number;
}

/**
 * Assign each point a row so overlapping observations remain individually
 * visible and clickable. Deterministic — the same data always renders
 * identically, which matters for a page a researcher may screenshot.
 */
function stack(
  points: readonly DistributionPoint[],
  toPct: (value: number) => number,
): PlacedPoint[] {
  const sorted = [...points].sort((a, b) => a.value - b.value);
  const placed: PlacedPoint[] = [];
  let previousX: number | null = null;
  let row = 0;

  for (const point of sorted) {
    const xPct = toPct(point.value);
    if (previousX !== null && Math.abs(xPct - previousX) < COLLISION_PCT) {
      row += 1;
    } else {
      row = 0;
    }
    placed.push({ ...point, xPct, row });
    previousX = xPct;
  }
  return placed;
}
