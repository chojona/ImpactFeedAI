/**
 * The one chip.
 *
 * Previously the codebase had three: a provenance chip in `StatusBadges`, a
 * category chip re-declared inline in both `EventHeader` and `EventCard` with
 * different paddings and letter-spacings, and a count pill in the filter bar.
 * They were visibly different sizes on the same screen.
 *
 * Two sizes only. `xs` is for chips that sit inside dense rows (a feed card
 * header), `sm` for chips that sit on their own line.
 */
export type BadgeTone =
  | "neutral"
  | "positive"
  | "caution"
  | "negative"
  | "info"
  | "accent";

const TONE: Record<BadgeTone, string> = {
  neutral: "border-line bg-white/[0.03] text-ink-3",
  positive: "border-pos/25 bg-pos/[0.07] text-pos",
  caution: "border-warn/25 bg-warn/[0.07] text-warn",
  negative: "border-neg/25 bg-neg/[0.07] text-neg",
  info: "border-info/25 bg-info/[0.06] text-info",
  accent: "border-brand/35 bg-brand-tint-strong text-brand-bright",
};

const SIZE = {
  xs: "gap-1 px-1.5 py-0.5 text-[9px] tracking-[0.14em]",
  sm: "gap-1.5 px-2 py-1 text-[10px] tracking-[0.14em]",
} as const;

interface Props {
  tone?: BadgeTone;
  size?: keyof typeof SIZE;
  /** Leading status dot. Pairs colour with a shape for non-colour readers. */
  dot?: boolean;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export function Badge({
  tone = "neutral",
  size = "sm",
  dot = false,
  title,
  className = "",
  style,
  children,
}: Props) {
  return (
    <span
      title={title}
      style={style}
      className={`inline-flex shrink-0 items-center rounded-md border font-mono font-semibold uppercase ${
        SIZE[size]
      } ${TONE[tone]} ${className}`}
    >
      {dot && (
        <span
          aria-hidden
          className="h-1 w-1 shrink-0 rounded-full bg-current opacity-80"
        />
      )}
      {children}
    </span>
  );
}
