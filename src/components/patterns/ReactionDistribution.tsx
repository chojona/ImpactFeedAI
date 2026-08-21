import Link from "next/link";

import {
  MIN_DISTRIBUTION_SAMPLE,
  summarizeDistribution,
  type DistributionPoint,
  type DistributionSummary,
} from "@/services/analytics/patternAnalysis";
import { halfDomainFor } from "@/services/events/reactionChart";
import {
  WINDOW_DESCRIPTIONS,
  WINDOW_LABELS,
  formatPercentChange,
  formatPercentagePoints,
} from "@/services/events/reactionView";
import { moveColor, moveTextClass } from "@/components/reactions/reactionTone";
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
 * imply a population this data cannot characterise. The only derived marks are
 * the median — a real order statistic of the points shown — and the observed
 * min–max span, which is the range of these numbers rather than an interval
 * estimate for any future one.
 *
 * Every statistic comes from {@link summarizeDistribution}, not from a second
 * pass over `points` here. The caption and the marks are therefore guaranteed
 * to describe the same set; recomputing them locally is how a chart and its own
 * legend start disagreeing.
 *
 * When `selectedEventId` names an event in the set, its dot is enlarged and
 * ringed and the caption reports where it ranked. A selected id that is *not*
 * in the set draws nothing extra — the event is then genuinely outside this
 * distribution, and inventing a marker for it would be the same lie as
 * inventing an observation.
 */

/** Dots closer together than this share a column and stack vertically. */
const COLLISION_PCT = 3;
const ROW_HEIGHT = 14;
const MAX_ROWS = 5;

interface Props {
  points: readonly DistributionPoint[];
  symbol: string;
  window: ReactionWindow;
  /** Event to locate within the distribution, when one is in focus. */
  selectedEventId?: string | null;
  /** Omit the per-dot links, for contexts that are already inside an event. */
  linkDots?: boolean;
}

export function ReactionDistribution({
  points,
  symbol,
  window,
  selectedEventId = null,
  linkDots = true,
}: Props) {
  const summary = summarizeDistribution(points, {
    symbol,
    window,
    selectedEventId,
  });

  if (summary === null) {
    return (
      <p className="rounded-lg border border-dashed border-line bg-white/[0.01] px-4 py-8 text-center text-[13px] text-ink-3">
        <span aria-hidden className="num mr-2 text-ink-4">
          —
        </span>
        No {symbol} observation at {WINDOW_LABELS[window]} in this category.
      </p>
    );
  }

  // The axis is padded past the extremes so an outlier dot is not clipped by
  // the frame. The caption reports the true min and max, so the padding never
  // becomes a claim about the observed range.
  const halfDomain = halfDomainFor(points.map((p) => p.value));
  const toPct = (value: number): number => 50 + (value / halfDomain) * 50;

  const placed = stack(points, toPct);
  const rows = Math.min(MAX_ROWS, Math.max(...placed.map((p) => p.row)) + 1);
  const plotHeight = rows * ROW_HEIGHT + 16;

  return (
    <figure>
      <div
        className="relative w-full rounded-lg border border-line bg-black/20"
        style={{ height: `${plotHeight + 26}px` }}
      >
        <div
          aria-hidden
          className="absolute inset-x-0 top-0"
          style={{ height: `${plotHeight}px` }}
        >
          {/* Observed span. Drawn behind the dots and deliberately flat and
              grey: it is the range of these numbers, not a confidence band. */}
          <span
            className="absolute inset-y-1/2 h-px bg-white/15"
            style={{
              left: `${toPct(summary.min)}%`,
              width: `${toPct(summary.max) - toPct(summary.min)}%`,
            }}
          />
          <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
          <span
            className="absolute inset-y-1 w-[2px] -translate-x-1/2 rounded-full opacity-70"
            style={{
              left: `${toPct(summary.median)}%`,
              backgroundColor: moveColor(summary.median),
            }}
          />
        </div>

        {placed.map((point) => (
          <Dot
            key={`${point.eventId}-${point.value}`}
            point={point}
            window={window}
            selected={point.eventId === summary.selected?.eventId}
            link={linkDots}
          />
        ))}

        <div
          aria-hidden
          className="num absolute inset-x-0 bottom-0 flex justify-between px-2.5 text-[10px] text-ink-4"
        >
          <span>−{halfDomain.toFixed(2)}%</span>
          <span>0%</span>
          <span>+{halfDomain.toFixed(2)}%</span>
        </div>
      </div>

      {summary.selected && (
        <SelectedCallout summary={summary} symbol={symbol} window={window} />
      )}

      <Caption summary={summary} window={window} />
    </figure>
  );
}

/**
 * Where the event in focus landed. Phrased as an order statistic ("3rd of 9")
 * rather than as a probability, because a rank is exactly what nine
 * observations can support and a percentile is not.
 */
function SelectedCallout({
  summary,
  symbol,
  window,
}: {
  summary: DistributionSummary;
  symbol: string;
  window: ReactionWindow;
}) {
  const selected = summary.selected;
  if (!selected) return null;

  return (
    <p className="mt-3 rounded-md border border-line bg-white/[0.03] px-3.5 py-2.5 text-[12px] leading-relaxed text-ink-3">
      <span className="num font-semibold text-ink">{symbol}</span>{" "}
      moved{" "}
      <span
        className={`num font-semibold ${moveTextClass(selected.value)}`}
      >
        {formatPercentChange(selected.value)}
      </span>{" "}
      after this release — the{" "}
      <span className="num text-ink">
        {rankPhrase(selected.rank, summary.count)}
      </span>{" "}
      of{" "}
      <span className="num text-ink">
        {summary.count}
      </span>{" "}
      comparable {summary.count === 1 ? "observation" : "observations"}
      {summary.sufficient && (
        <>
          ,{" "}
          <span
            className={`num ${moveTextClass(selected.vsMedian)}`}
          >
            {formatPercentagePoints(selected.vsMedian)}
          </span>{" "}
          against the median
        </>
      )}
      .{" "}
      <span className="text-ink-4">
        Ranked from most negative to most positive over the{" "}
        {WINDOW_LABELS[window]} moves shown above, this event included.
      </span>
    </p>
  );
}

function Caption({
  summary,
  window,
}: {
  summary: DistributionSummary;
  window: ReactionWindow;
}) {
  return (
    <figcaption className="mt-3 space-y-1.5 text-[11px] text-ink-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <span>
          <span className="num text-ink-2">
            {summary.count}
          </span>{" "}
          {summary.count === 1 ? "observation" : "observations"}
        </span>
        <span>
          median{" "}
          <span className="num text-ink-2">
            {formatPercentChange(summary.median)}
          </span>
        </span>
        {/* The mean is withheld below the sample floor. Over two observations
            it is the midpoint of two numbers, and printing it beside a median
            invites reading two independent estimates where there is one. */}
        {summary.sufficient && (
          <span>
            mean{" "}
            <span className="num text-ink-3">
              {formatPercentChange(summary.mean)}
            </span>
          </span>
        )}
        <span>
          range{" "}
          <span className="num text-ink-2">
            {formatPercentChange(summary.min)} …{" "}
            {formatPercentChange(summary.max)}
          </span>
        </span>
        <span>
          <span className="num text-pos">
            {summary.positive}
          </span>{" "}
          up
          {" · "}
          <span className="num text-neg">
            {summary.negative}
          </span>{" "}
          down
          {summary.flat > 0 && (
            <>
              {" · "}
              <span className="num text-ink-3">
                {summary.flat}
              </span>{" "}
              unchanged
            </>
          )}
        </span>
      </div>

      {summary.sufficient ? (
        <p className="text-ink-4">
          Each dot is one event {WINDOW_DESCRIPTIONS[window]}; select one to
          open it.
        </p>
      ) : (
        <p className="text-warn">
          Insufficient data — {summary.count}{" "}
          {summary.count === 1 ? "observation" : "observations"} is below the{" "}
          {MIN_DISTRIBUTION_SAMPLE}-observation floor for describing a
          distribution. Read the individual{" "}
          {summary.count === 1 ? "dot" : "dots"} above, not the median.
        </p>
      )}
    </figcaption>
  );
}

function Dot({
  point,
  window,
  selected,
  link,
}: {
  point: PlacedPoint;
  window: ReactionWindow;
  selected: boolean;
  link: boolean;
}) {
  const date = formatNewYorkDate(point.at);
  const change = formatPercentChange(point.value);
  const title = `${point.title} — ${change} at ${WINDOW_LABELS[window]}${
    date === null ? "" : ` on ${date}`
  }${selected ? " (this event)" : ""}`;

  const mark = (
    <span
      className={`block rounded-full transition ${
        selected
          ? "h-3.5 w-3.5 ring-2 ring-white/85"
          : "h-2.5 w-2.5 opacity-85 hover:scale-150 hover:opacity-100"
      }`}
      style={{ backgroundColor: moveColor(point.value) }}
    />
  );

  const style = {
    left: `${point.xPct}%`,
    top: `${8 + (point.row % MAX_ROWS) * ROW_HEIGHT}px`,
  };

  // The event currently being read is marked but not linked to itself.
  if (selected || !link) {
    return (
      <span
        // `role="img"` so the label is announced: an aria-label on a generic
        // span is ignored by most screen readers, which would leave the one
        // dot the reader most needs identified as the only silent mark.
        role="img"
        title={title}
        aria-current={selected ? "true" : undefined}
        aria-label={`${point.title}, ${change} at ${WINDOW_LABELS[window]}${
          selected ? ", the event shown on this page" : ""
        }`}
        className={`absolute -translate-x-1/2 ${selected ? "z-20" : "z-10"}`}
        style={style}
      >
        {mark}
      </span>
    );
  }

  return (
    <Link
      href={`/events/${point.eventId}`}
      title={title}
      aria-label={`${point.title}, ${change} at ${WINDOW_LABELS[window]}`}
      className="absolute z-10 -translate-x-1/2 rounded-full"
      style={style}
    >
      {mark}
    </Link>
  );
}

/**
 * How a rank reads in a sentence.
 *
 * "9th of 9" is correct but makes the largest move in the set sound like a
 * middling one, so the two extremes are named. Everything in between keeps the
 * ordinal, which is the only claim nine observations support.
 */
const rankPhrase = (rank: number, count: number): string => {
  if (count === 1) return "only";
  if (rank === 1) return "most negative";
  if (rank === count) return "most positive";
  return ordinal(rank);
};

const ordinal = (n: number): string => {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
};

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
  const sorted = [...points].sort(
    (a, b) => a.value - b.value || a.eventId.localeCompare(b.eventId),
  );
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
