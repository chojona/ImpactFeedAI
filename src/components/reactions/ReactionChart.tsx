import {
  buildReactionPlot,
  polylinePoints,
  type PlotPoint,
  type PlotSeries,
} from "@/services/events/reactionChart";
import {
  WINDOW_DESCRIPTIONS,
  WINDOW_LABELS,
  formatPercentChange,
  pctForWindow,
} from "@/services/events/reactionView";
import { moveColor, moveTextClass } from "./reactionTone";
import type { AssetReaction, ReactionWindow } from "@/types/events";

/**
 * Reaction chart for one asset: cumulative percent change from the pre-release
 * baseline at each measured window.
 *
 * **This is not a price chart.** The database stores four prices per asset, so
 * what exists is three observations and an anchor. The component renders the
 * observations as filled markers and the segments between them as *dashed*
 * connectors, because the line is an aid to reading the sequence, not a
 * measured path. An unmeasured window is drawn as an empty slot with a dimmed
 * axis label — never as a point on the zero line.
 *
 * Geometry lives in `services/events/reactionChart.ts` and is expressed in
 * percentages, so the SVG holds only lines while every marker and label is real
 * HTML. That keeps text crisp at any width, keeps the markers circular under a
 * stretched viewBox, and means the whole chart renders on the server.
 *
 * When intraday candles exist, they belong in a sibling component that consumes
 * a candle series; nothing here needs to change for that to happen.
 */

interface Props {
  asset: AssetReaction | null;
  /** Other assets on the same event, drawn faintly for cross-asset context. */
  context?: readonly AssetReaction[];
  /** Window to emphasise. Its marker is ringed and drives the line colour. */
  highlightWindow?: ReactionWindow;
  /** Rendered when there is no asset to plot at all. */
  emptyMessage?: string;
}

export function ReactionChart({
  asset,
  context = [],
  highlightWindow = "1d",
  emptyMessage = "No measured reaction to plot",
}: Props) {
  if (asset === null) return <EmptyChart message={emptyMessage} />;

  const plot = buildReactionPlot({ focus: asset, context });
  const focus = plot.focus;
  const measured = focus?.points.filter((p) => p.measured) ?? [];

  if (focus === null || measured.length === 0) {
    return (
      <EmptyChart message={`No window was measurable for ${asset.symbol}`} />
    );
  }

  const highlighted = pctForWindow(asset, highlightWindow);
  const lineValue = highlighted ?? measured[measured.length - 1].value;
  const lineColor = moveColor(lineValue);

  const summary = [
    `${asset.symbol} reaction from the pre-release baseline.`,
    ...measured.map(
      (p) => `${p.label}: ${formatPercentChange(p.value) ?? "unavailable"}.`,
    ),
    plot.missingWindows.length > 0
      ? `Not measured: ${plot.missingWindows
          .map((w) => WINDOW_LABELS[w])
          .join(", ")}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <figure className="w-full">
      <div className="flex items-stretch gap-2">
        {/* Y axis gutter — HTML so the labels stay crisp at every width. */}
        <div className="relative h-44 w-14 shrink-0 sm:h-56" aria-hidden>
          {plot.ticks.map((tick) => (
            <span
              key={tick.value}
              className="absolute right-0 -translate-y-1/2 font-mono text-[10px] tabular-nums text-zinc-600"
              style={{ top: `${tick.yPct}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>

        <div
          className="relative h-44 min-w-0 flex-1 sm:h-56"
          role="img"
          aria-label={summary}
        >
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
            aria-hidden
          >
            {plot.ticks.map((tick) => (
              <line
                key={`grid-${tick.value}`}
                x1="0"
                x2="100"
                y1={tick.yPct}
                y2={tick.yPct}
                stroke={tick.value === 0 ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.05)"}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {plot.slots.map((slot) => (
              <line
                key={`slot-${slot.label}`}
                x1={slot.xPct}
                x2={slot.xPct}
                y1="0"
                y2="100"
                stroke="rgba(255,255,255,0.045)"
                strokeWidth={1}
                strokeDasharray={
                  slot.window !== null && plot.missingWindows.includes(slot.window)
                    ? "2 4"
                    : undefined
                }
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {plot.context.map((series) => (
              <ContextPath key={series.symbol} series={series} />
            ))}

            <polyline
              points={polylinePoints(focus.points)}
              fill="none"
              stroke={lineColor}
              strokeWidth={2}
              strokeDasharray="5 4"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {focus.points.map((point) => (
            <Marker
              key={point.label}
              point={point}
              symbol={asset.symbol}
              color={lineColor}
              highlighted={point.window === highlightWindow}
            />
          ))}
        </div>
      </div>

      {/* X axis labels — dimmed and struck for windows with no reading. */}
      <div className="relative mt-2 ml-16 h-8">
        {plot.slots.map((slot) => {
          const missing =
            slot.window !== null && plot.missingWindows.includes(slot.window);
          return (
            <div
              key={`x-${slot.label}`}
              className="absolute -translate-x-1/2 text-center"
              style={{ left: `${slot.xPct}%` }}
            >
              <div
                className={`font-mono text-[11px] font-semibold uppercase ${
                  missing ? "text-zinc-700" : "text-zinc-400"
                }`}
              >
                {slot.label}
              </div>
              {missing && (
                <div className="font-mono text-[9px] uppercase tracking-wide text-zinc-700">
                  n/a
                </div>
              )}
            </div>
          );
        })}
      </div>

      <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-600">
        <LegendKey color={lineColor} />
        <span>Slots evenly spaced — the axis is not to scale.</span>
        {plot.missingWindows.length > 0 && (
          <span className="text-amber-300/60">
            Not measured:{" "}
            {plot.missingWindows.map((w) => WINDOW_LABELS[w]).join(", ")}
          </span>
        )}
        {plot.context.length > 0 && (
          <span>{plot.context.length} other assets shown faintly.</span>
        )}
      </figcaption>
    </figure>
  );
}

function LegendKey({ color }: { color: string }) {
  return (
    <span className="flex items-center gap-3">
      <span className="flex items-center gap-1.5">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        measured
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-px w-5 border-t-2 border-dashed border-zinc-600" />
        connector, not observed
      </span>
    </span>
  );
}

function ContextPath({ series }: { series: PlotSeries }) {
  const last = series.points[series.points.length - 1];
  return (
    <polyline
      points={polylinePoints(series.points)}
      fill="none"
      stroke={moveColor(last.value)}
      strokeWidth={1}
      strokeDasharray="4 4"
      strokeOpacity={0.22}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    />
  );
}

/**
 * A single observation. The tooltip is CSS-only (`group-hover`) so the chart
 * needs no client JavaScript; the same numbers are always available as text in
 * the reaction table beside it, so the tooltip is an affordance rather than the
 * sole representation.
 */
function Marker({
  point,
  symbol,
  color,
  highlighted,
}: {
  point: PlotPoint;
  symbol: string;
  color: string;
  highlighted: boolean;
}) {
  const formatted = formatPercentChange(point.value);
  const description =
    point.window === null
      ? "pre-release baseline"
      : WINDOW_DESCRIPTIONS[point.window];

  return (
    <div
      className="group absolute z-10 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${point.xPct}%`, top: `${point.yPct}%` }}
    >
      <span
        className={`block rounded-full ring-2 ring-[#080C10] transition-transform group-hover:scale-125 ${
          highlighted ? "h-3 w-3" : "h-2 w-2"
        }`}
        style={{
          backgroundColor: point.measured ? color : "#52525B",
          boxShadow: highlighted ? `0 0 0 3px ${color}33` : undefined,
        }}
      />
      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-[#0B1116] px-2.5 py-1.5 shadow-lg group-hover:block">
        <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          {symbol} · {point.label}
        </div>
        <div
          className={`font-mono text-sm font-semibold tabular-nums ${moveTextClass(
            point.value,
          )}`}
        >
          {formatted ?? "—"}
        </div>
        {point.price !== null && (
          <div className="font-mono text-[10px] tabular-nums text-zinc-500">
            {point.price.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
          </div>
        )}
        <div className="max-w-44 text-[10px] leading-snug text-zinc-600">
          {description}
        </div>
      </div>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.01] px-6 text-center text-sm text-zinc-500 sm:h-56">
      {message}
    </div>
  );
}
