import {
  Ban,
  CircleDashed,
  CircleSlash,
  Hourglass,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";

import { DATA_STATE, type DataState } from "./dataState";

/**
 * The designed rendering of "there is nothing here".
 *
 * On a product where roughly three in five events carry no measurable reaction,
 * this component gets more screen time than any chart, so it is built as a
 * finding rather than as a failure: an icon that identifies the *kind* of
 * absence, a heading that states it, a sentence that gives the cause, and an
 * optional line naming the fix.
 *
 * The states are deliberately not interchangeable. `suppressed` means the
 * application is refusing to publish a number it could compute — the timing
 * provenance does not clear the bar — and is toned as a decision. `unsupported`
 * means the upstream source does not publish the thing at all, which is nobody's
 * bug. `error` means the code broke. Collapsing those into one grey box, which
 * is what the previous `EmptyNote` did, teaches the reader that coverage is
 * worse than it is and that bugs are normal.
 */

const ICON: Record<DataState, typeof Ban> = {
  measured: CircleDashed,
  partial: CircleDashed,
  unavailable: CircleDashed,
  suppressed: ShieldAlert,
  unsupported: CircleSlash,
  pending: Hourglass,
  error: TriangleAlert,
};

interface Props {
  state: Exclude<DataState, "measured">;
  title: string;
  children: React.ReactNode;
  /** Quieter second paragraph: the remedy, or why the choice was made. */
  footnote?: React.ReactNode;
  /** Keeps a section from collapsing where a chart would otherwise sit. */
  minHeight?: "none" | "chart";
  className?: string;
}

export function DataStatePanel({
  state,
  title,
  children,
  footnote,
  minHeight = "none",
  className = "",
}: Props) {
  const style = DATA_STATE[state];
  const Icon = ICON[state];
  const dashed = state === "unavailable" || state === "unsupported";

  return (
    <div
      className={`flex flex-col justify-center rounded-lg border px-5 py-8 sm:px-6 ${
        dashed ? "border-dashed" : ""
      } ${style.border} ${style.surface} ${
        minHeight === "chart" ? "min-h-[240px]" : ""
      } ${className}`}
    >
      <div className="flex items-start gap-3">
        <Icon
          aria-hidden
          className={`mt-0.5 h-4 w-4 shrink-0 ${style.text}`}
          strokeWidth={2}
        />
        <div className="min-w-0">
          <h3 className={`text-sm font-semibold ${style.text}`}>{title}</h3>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-3">
            {children}
          </p>
          {footnote !== undefined && (
            <p className="mt-3 max-w-2xl text-xs leading-relaxed text-ink-4">
              {footnote}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The inline form, for a cell or a chart frame too small for a paragraph.
 * Still names the state in words — the whole point is that a reader never has
 * to wonder whether a component failed to load.
 */
export function DataStateNote({
  state,
  children,
  className = "",
}: {
  state: Exclude<DataState, "measured">;
  children: React.ReactNode;
  className?: string;
}) {
  const style = DATA_STATE[state];
  return (
    <p
      className={`flex items-center gap-2 text-xs ${style.text} ${className}`}
    >
      <span aria-hidden className="num">
        {style.glyph}
      </span>
      <span className="text-ink-3">{children}</span>
    </p>
  );
}
