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
 * measured path. An unmeasured window is drawn as an empty slot with a struck
 * axis label — never as a point on the zero line.
 *
 * Geometry lives in `services/events/reactionChart.ts` and is expressed in
 * percentages, so the SVG holds only lines while every marker and label is real
 * HTML. That keeps text crisp at any width, keeps the markers circular under a
 * stretched viewBox, and means the whole chart renders on the server.
 *
 * ### What the redesign changed
 *
 * Every value is now **directly labelled** at its marker. Previously the only
 * way to read a point was to hover it, which is unavailable on touch, invisible
 * in a screenshot, and hostile to the actual research task of comparing three
 * numbers. The tooltip survives for the absolute price, which is genuinely
 * secondary. The plot is also taller, the zero line is heavier than the other
 * gridlines, and the axis type moved off `zinc-600` — at 10px on this
 * background it was below every contrast floor that applies.
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
        <div className="relative h-52 w-14 shrink-0 sm:h-64" aria-hidden>
          {plot.ticks.map((tick) => (
            <span
              key={tick.value}
              className={`num absolute right-0 -translate-y-1/2 text-[10px] ${
                tick.value === 0 ? "text-ink-3" : "text-ink-4"
              }`}
              style={{ top: `${tick.yPct}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>

        <div
          className="relative h-52 min-w-0 flex-1 sm:h-64"
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
                stroke={
                  tick.value === 0
                    ? "rgba(255,255,255,0.28)"
                    : "rgba(255,255,255,0.05)"
                }
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
                stroke="rgba(255,255,255,0.05)"
                strokeWidth={1}
                strokeDasharray={
                  slot.window !== null &&
                  plot.missingWindows.includes(slot.window)
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
              strokeWidth={2.25}
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

      {/* X axis labels — dimmed and explicitly marked for missing windows. */}
      <div className="relative mt-2 ml-16 h-9">
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
                className={`num text-[11px] font-semibold uppercase ${
                  missing ? "text-ink-4 line-through decoration-1" : "text-ink-2"
                }`}
              >
                {slot.label}
              </div>
              <div className="mt-0.5 text-[9px] uppercase tracking-wide text-ink-4">
                {slot.window === null ? "release" : missing ? "no data" : null}
              </div>
            </div>
          );
        })}
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-3">
        <Legend color={lineColor} contextCount={plot.context.length} />
        <span className="text-ink-4">
          Slots evenly spaced — the axis is not to scale.
        </span>
        {plot.missingWindows.length > 0 && (
          <span className="text-warn">
            Not measured:{" "}
            {plot.missingWindows.map((w) => WINDOW_LABELS[w]).join(", ")}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/**
 * The legend names the one thing a reader could otherwise get wrong: the line
 * between two markers is not data. Kept adjacent to the chart rather than in a
 * footnote for exactly that reason.
 */
function Legend({
  color,
  contextCount,
}: {
  color: string;
  contextCount: number;
}) {
  return (
    <span className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
      <span className="flex items-center gap-1.5">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        observed
      </span>
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block h-px w-5 border-t-2 border-dashed border-ink-4"
        />
        connector, not observed
      </span>
      {contextCount > 0 && (
        <span className="text-ink-4">
          {contextCount} other instruments shown faintly
        </span>
      )}
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
      strokeOpacity={0.18}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    />
  );
}

/**
 * A single observation, with its value written beside it.
 *
 * The label sits above a positive reading and below a negative one, which keeps
 * it away from the connector on both sides and means the label's own position
 * reinforces the sign. The anchor carries no label — it is 0% by definition
 * rather than by measurement, and printing "0.00%" on it would be the one
 * fabricated number on an otherwise honest chart.
 *
 * The tooltip is CSS-only (`group-hover`) so the chart still needs no client
 * JavaScript. It now carries only the absolute price and the window's long
 * description; the percentage it used to hide is on the page unconditionally.
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
  const above = point.value >= 0;

  return (
    <div
      className="group absolute z-10 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${point.xPct}%`, top: `${point.yPct}%` }}
    >
      <span
        className={`block rounded-full ring-2 ring-canvas transition-transform group-hover:scale-125 ${
          highlighted ? "h-3.5 w-3.5" : "h-2.5 w-2.5"
        }`}
        style={{
          backgroundColor: point.measured ? color : "var(--color-unmeasured)",
          boxShadow: highlighted ? `0 0 0 4px ${color}2E` : undefined,
        }}
      />

      {point.measured && formatted !== null && (
        <span
          className={`num pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold ${moveTextClass(
            point.value,
          )} ${above ? "bottom-full mb-2" : "top-full mt-2"} ${
            highlighted ? "" : "opacity-80"
          }`}
        >
          {formatted}
        </span>
      )}

      <div
        className={`pointer-events-none absolute left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line-strong bg-surface-2 px-2.5 py-1.5 shadow-lg group-hover:block ${
          above ? "bottom-full mb-6" : "top-full mt-6"
        }`}
      >
        <div className="eyebrow">
          {symbol} · {point.label}
        </div>
        {point.price !== null && (
          <div className="num mt-1 text-[13px] font-semibold text-ink">
            {point.price.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
          </div>
        )}
        <div className="mt-0.5 max-w-44 text-[10px] leading-snug text-ink-3">
          {description}
        </div>
      </div>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-52 items-center justify-center rounded-lg border border-dashed border-line bg-white/[0.01] px-6 text-center text-[13px] text-ink-3 sm:h-64">
      <span>
        <span aria-hidden className="num mr-2 text-ink-4">
          —
        </span>
        {message}
      </span>
    </div>
  );
}
