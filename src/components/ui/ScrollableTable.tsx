/**
 * The wrapper every wide research table gets.
 *
 * On a phone the reaction and coverage tables are wider than the viewport. The
 * previous `overflow-x-auto` divs clipped them dead at the edge, so a column of
 * percentages ended mid-glyph — which looks like a layout bug rather than like
 * content that continues. Two fixes, both cheap:
 *
 *   - the `.scroll-x` edge indicator (see `globals.css`), which appears only
 *     when the table actually overflows;
 *   - a `tabindex`/`role` pair, because a scroll container holding content that
 *     can only be reached by scrolling has to be reachable by keyboard.
 *
 * Callers make their first column `sticky left-0` so the instrument symbol
 * stays put while the horizons scroll under it; that is what keeps a clipped
 * table readable rather than merely scrollable.
 */
interface Props {
  /** Labels the scroll region for assistive tech. */
  label: string;
  children: React.ReactNode;
  className?: string;
}

export function ScrollableTable({ label, children, className = "" }: Props) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={`scroll-x ${className}`}
    >
      {children}
    </div>
  );
}
