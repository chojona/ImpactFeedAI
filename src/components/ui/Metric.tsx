import { DATA_STATE, type DataState } from "./dataState";

/**
 * A labelled number, and the reason there isn't one.
 *
 * The audit's clearest single finding: the important quantities on this product
 * were rendered at the same weight as the words describing them, so a page of
 * measured market moves read as a page of prose. A metric here inverts that —
 * the label is the quietest thing in the block and the value is the loudest.
 *
 * Absence is a first-class rendering rather than an empty string. When `value`
 * is null the component prints the data state's word (never a zero, never a
 * blank) at a smaller size and in a muted tone, so a reader scanning a column
 * of numbers can see at a glance which rows are facts and which are gaps —
 * §5 of the redesign brief, and the codebase's own integrity rule 1.
 *
 * There is deliberately only one variant. An earlier draft had a `<div>`-based
 * `Metric` beside this `<dl>`-based one; every caller turned out to be labelling
 * a value, which is what a definition list is for, so the second variant was
 * duplication with no caller.
 */

export type MetricSize = "xl" | "lg" | "md" | "sm";
export type MetricTone = "neutral" | "positive" | "negative" | "caution";

const VALUE_SIZE: Record<MetricSize, string> = {
  xl: "text-[26px] leading-none sm:text-[34px]",
  lg: "text-xl leading-none sm:text-2xl",
  md: "text-base leading-none sm:text-lg",
  sm: "text-[13px] leading-none",
};

/** Absence is set smaller than a present value — it is a word, not a figure. */
const ABSENT_SIZE: Record<MetricSize, string> = {
  xl: "text-base sm:text-lg",
  lg: "text-sm sm:text-base",
  md: "text-[13px]",
  sm: "text-[11px]",
};

const TONE: Record<MetricTone, string> = {
  neutral: "text-ink",
  positive: "text-pos",
  negative: "text-neg",
  caution: "text-warn",
};

interface Props {
  label: string;
  /** Formatted, already in the metric's canonical unit. Null when absent. */
  value: string | null;
  size?: MetricSize;
  tone?: MetricTone;
  /** Why the value is absent, and which kind of absence it is. */
  state?: DataState;
  /** Overrides the state registry's word, e.g. "No forecast source". */
  absenceLabel?: string;
  /** Trailing qualifier beside the value: a window, a unit, a symbol. */
  unit?: React.ReactNode;
  /** One quiet line under the value. Provenance, caveats, sample size. */
  note?: React.ReactNode;
  /** Marks `note` as a warning rather than a neutral aside. */
  noteTone?: "muted" | "caution";
  className?: string;
  title?: string;
}

/**
 * One term/value pair. A definition list so a screen reader announces the label
 * with its number rather than as two unrelated fragments.
 */
export function MetricCell({
  label,
  value,
  size = "md",
  tone = "neutral",
  state = "unavailable",
  absenceLabel,
  unit,
  note,
  noteTone = "muted",
  className = "",
  title,
}: Props) {
  const measured = value !== null;
  const absent = DATA_STATE[state];

  return (
    <div className={`min-w-0 sm:pl-5 sm:first:pl-0 ${className}`} title={title}>
      <dt className="eyebrow truncate">{label}</dt>
      <dd className="mt-1.5">
        <span className="flex items-baseline gap-1.5">
          <span
            className={`num font-semibold ${
              measured
                ? `${VALUE_SIZE[size]} ${TONE[tone]}`
                : `${ABSENT_SIZE[size]} ${absent.text} font-medium`
            }`}
          >
            {measured ? value : (absenceLabel ?? absent.label)}
          </span>
          {unit !== undefined && measured && (
            <span className="eyebrow shrink-0">{unit}</span>
          )}
        </span>
        {note !== undefined && note !== null && (
          <span
            className={`mt-1 block text-[11px] leading-snug ${
              noteTone === "caution" ? "text-warn/85" : "text-ink-3"
            }`}
          >
            {note}
          </span>
        )}
      </dd>
    </div>
  );
}

/**
 * A row of metrics that reads as one analytical unit.
 *
 * Hairline dividers rather than individual cards: the values belong to the same
 * measurement, and boxing each one separately implies they are independent
 * findings. Collapses to two columns on a phone before one, because two
 * side-by-side percentages are still comparable and a single stacked column of
 * four is a scroll.
 */
export function MetricRow({
  children,
  columns = 4,
  className = "",
  ...aria
}: {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
  "aria-label"?: string;
}) {
  const grid =
    columns === 2
      ? "grid-cols-2"
      : columns === 3
        ? "grid-cols-2 sm:grid-cols-3"
        : "grid-cols-2 sm:grid-cols-4";

  return (
    <dl
      {...aria}
      className={`grid ${grid} gap-x-5 gap-y-5 divide-line sm:divide-x ${className}`}
    >
      {children}
    </dl>
  );
}
