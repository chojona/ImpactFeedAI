import { CATEGORY_CONFIG } from "@/lib/eventCategories";
import type { EventCategory } from "@/types/events";

/**
 * The category chip, in one place.
 *
 * `EventHeader` and `EventCard` each declared their own inline version with
 * different padding, font size and letter spacing, which is why the same chip
 * looked like two chips when the feed and a detail page sat side by side.
 *
 * Category colour is the one place in the interface where colour is allowed to
 * be purely taxonomic rather than semantic, so it is kept to a tinted border
 * and text — never a solid fill. A saturated block of INFLATION red next to a
 * measured −1.58% would compete with the only red on the page that means
 * something.
 */
const SIZE = {
  xs: "px-1.5 py-0.5 text-[9px] tracking-[0.14em]",
  sm: "px-2 py-1 text-[10px] tracking-[0.16em]",
} as const;

export function CategoryBadge({
  category,
  size = "sm",
}: {
  category: EventCategory;
  size?: keyof typeof SIZE;
}) {
  const color = CATEGORY_CONFIG[category].color;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border font-mono font-semibold uppercase ${SIZE[size]}`}
      style={{
        color,
        borderColor: `${color}59`,
        backgroundColor: `${color}14`,
      }}
    >
      {category}
    </span>
  );
}

/**
 * A traded instrument: the ticker leads, the human name follows quietly.
 *
 * The ordering is the point — a researcher scans tickers, and `SPY` in mono at
 * full contrast beside `S&P 500` in muted sans is findable in a column of
 * twelve rows in a way that two equal-weight words are not.
 */
export function InstrumentBadge({
  symbol,
  name,
  emphasis = false,
  className = "",
}: {
  symbol: string;
  name?: string;
  /** Marks the instrument currently in focus. */
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <span className={`flex min-w-0 items-baseline gap-2 ${className}`}>
      <span
        className={`num shrink-0 text-[13px] font-semibold ${
          emphasis ? "text-brand-bright" : "text-ink"
        }`}
      >
        {symbol}
      </span>
      {name !== undefined && (
        <span className="truncate text-[11px] text-ink-3">{name}</span>
      )}
    </span>
  );
}
