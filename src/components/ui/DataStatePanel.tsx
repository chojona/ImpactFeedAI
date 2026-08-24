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
 * The second visual pass gave it a tinted surface, a semantic border, an icon
 * container and a status label beside the heading. It is the same information
 * with four more ways in: a reader now identifies the *kind* of absence from the
 * chip colour before reading a word, and the label spells it out for anyone who
 * cannot.
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
      className={`surface-lift flex flex-col justify-center rounded-lg border px-5 py-7 sm:px-6 ${
        dashed ? "border-dashed" : ""
      } ${style.border} ${style.surface} ${
        minHeight === "chart" ? "min-h-[240px]" : ""
      } ${className}`}
    >
      <div className="flex items-start gap-3.5">
        {/* The icon lives in a bordered, tinted container rather than floating
            beside the text. It gives the panel one fixed focal point, which is
            what makes a state read as a status rather than as a paragraph that
            happens to sit in a coloured box. */}
        <span
          aria-hidden
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${style.iconChip}`}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h3 className={`text-sm font-semibold ${style.text}`}>{title}</h3>
            <span className="eyebrow">{style.label}</span>
          </div>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-3">
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
