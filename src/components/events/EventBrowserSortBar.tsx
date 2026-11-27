import type { SortMode } from "@/services/events/queryParams";

function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-brand/45 bg-brand-tint-strong text-brand-bright"
          : "border-transparent text-ink-3 hover:bg-brand-tint hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Result count + sort toggles. "Biggest SPY move" is a fixed-benchmark ranking,
 * not a cross-asset max-|move| sort.
 */
export function EventBrowserSortBar({
  eventsLoaded,
  total,
  ranked,
  sortMode,
  onSortChange,
}: {
  eventsLoaded: number;
  total: number;
  ranked: string | null;
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
}) {
  return (
    <div className="mt-6 mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line pb-3.5">
      <div className="min-w-0" aria-live="polite">
        <p className="text-[13px] text-ink-3">
          <span className="num font-semibold text-ink">{eventsLoaded}</span>
          <span className="text-ink-4"> of </span>
          <span className="num text-ink-2">{total}</span>
          <span className="text-ink-4">
            {" "}
            {total === 1 ? "event" : "events"}
          </span>
        </p>
        {ranked !== null && (
          <p className="mt-0.5 text-[11px] text-ink-4">{ranked}</p>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        <span className="eyebrow">Sort</span>
        <div
          role="group"
          aria-label="Sort order"
          className="flex items-center gap-1 rounded-lg border border-line bg-canvas/60 p-1"
        >
          <SortButton
            active={sortMode === "newest"}
            onClick={() => onSortChange("newest")}
          >
            Newest
          </SortButton>
          <SortButton
            active={sortMode === "biggest"}
            onClick={() => onSortChange("biggest")}
          >
            Biggest SPY move
          </SortButton>
        </div>
      </div>
    </div>
  );
}
