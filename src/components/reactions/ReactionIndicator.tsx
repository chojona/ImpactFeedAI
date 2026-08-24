import { formatPercentChange } from "@/services/events/reactionView";
import { directionOf } from "./reactionTone";

/**
 * A measured move, rendered so direction survives without colour.
 *
 * Every percentage in the product was previously colour-only: red text, green
 * text, and a grey em dash for "we did not measure this". That fails a
 * colour-blind reader on the single most important distinction the product
 * makes, and it fails anyone reading a screenshot in greyscale.
 *
 * So direction is carried three ways at once — the arithmetic sign that
 * `formatPercentChange` already emits, a triangle glyph, and the colour — and
 * the accessible name spells it out in words. An unmeasured reading gets no
 * arrow at all, which is what keeps it from reading as a flat market.
 */
interface Props {
  value: number | null;
  /** Instrument the move belongs to. Only used in the accessible name. */
  symbol?: string;
  /** Window the move was measured over. Only used in the accessible name. */
  windowLabel?: string;
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  className?: string;
}

const SIZE = {
  sm: "text-[12px]",
  md: "text-[15px]",
  lg: "text-xl sm:text-2xl",
  xl: "text-[28px] leading-none sm:text-[36px]",
  // The reaction hero. Deliberately far larger than anything else on the page:
  // this is the one number the whole event exists to report.
  hero: "text-[44px] leading-[0.95] tracking-tight sm:text-[60px]",
} as const;

const ARROW_SIZE = {
  sm: "text-[8px]",
  md: "text-[10px]",
  lg: "text-[12px]",
  xl: "text-[15px]",
  hero: "text-[22px] sm:text-[28px]",
} as const;

export function ReactionIndicator({
  value,
  symbol,
  windowLabel,
  size = "md",
  className = "",
}: Props) {
  const direction = directionOf(value);
  const formatted = formatPercentChange(value);

  const tone =
    direction === "UP"
      ? "text-pos"
      : direction === "DOWN"
        ? "text-neg"
        : direction === "FLAT"
          ? "text-flat"
          : "text-ink-4";

  const arrow =
    direction === "UP" ? "▲" : direction === "DOWN" ? "▼" : direction === "FLAT" ? "▬" : null;

  const words =
    direction === "UP"
      ? "up"
      : direction === "DOWN"
        ? "down"
        : direction === "FLAT"
          ? "unchanged"
          : "not measured";

  const label = [symbol, formatted ?? "not measured", words, windowLabel]
    .filter((part) => part !== undefined && part !== null)
    .join(" ");

  return (
    <span
      className={`inline-flex items-baseline gap-1.5 ${className}`}
      role="img"
      aria-label={label}
    >
      {arrow !== null && (
        <span aria-hidden className={`${ARROW_SIZE[size]} ${tone}`}>
          {arrow}
        </span>
      )}
      <span className={`num font-semibold ${SIZE[size]} ${tone}`} aria-hidden>
        {formatted ?? "—"}
      </span>
    </span>
  );
}
