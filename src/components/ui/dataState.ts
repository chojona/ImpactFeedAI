/**
 * One vocabulary for "how much do we actually know here".
 *
 * The product's defining constraint is that most cells are empty and each one
 * is empty for a *different reason*. Before this registry existed, a reader met
 * at least five different renderings of absence — a dashed grey box, an amber
 * callout, a grey callout, an em dash, and on the feed a stretch of blank
 * card — and had no way to tell which meant "the provider does not publish
 * this", which meant "we refuse to publish this", and which meant "something
 * broke".
 *
 * Each state gets a colour, a symbol and a word. All three, always: colour
 * alone fails a colour-blind reader and fails a greyscale print, so every
 * caller renders the label or the symbol too.
 *
 * Kept free of JSX so tone classes can be shared by cells, chips, table
 * captions and chart legends — the places most likely to drift apart.
 */

export type DataState =
  | "measured"
  | "partial"
  | "unavailable"
  | "suppressed"
  | "unsupported"
  | "pending"
  | "error";

export interface DataStateStyle {
  /** Short noun phrase. Never a bare "N/A". */
  label: string;
  /** Text-only marker, for tables and dense cells. */
  glyph: string;
  text: string;
  border: string;
  /** Panel/chip fill. Deliberately very low alpha — these are backgrounds. */
  surface: string;
  /** Solid dot / bar colour, for legends and status dots. */
  dot: string;
}

export const DATA_STATE: Readonly<Record<DataState, DataStateStyle>> = {
  measured: {
    label: "Measured",
    glyph: "●",
    text: "text-pos",
    border: "border-pos/25",
    surface: "bg-pos/[0.04]",
    dot: "bg-pos",
  },
  partial: {
    label: "Partly measured",
    glyph: "◐",
    text: "text-warn",
    border: "border-warn/25",
    surface: "bg-warn/[0.04]",
    dot: "bg-warn",
  },
  unavailable: {
    label: "Not measured",
    glyph: "—",
    text: "text-ink-4",
    border: "border-line",
    surface: "bg-surface-1",
    dot: "bg-unmeasured",
  },
  suppressed: {
    label: "Withheld",
    glyph: "⦸",
    text: "text-warn",
    border: "border-warn/25",
    surface: "bg-warn/[0.04]",
    dot: "bg-warn",
  },
  unsupported: {
    label: "Not published",
    glyph: "∅",
    text: "text-ink-4",
    border: "border-line",
    surface: "bg-surface-1",
    dot: "bg-unmeasured",
  },
  pending: {
    label: "Not ingested yet",
    glyph: "◌",
    text: "text-info",
    border: "border-info/20",
    surface: "bg-info/[0.03]",
    dot: "bg-info",
  },
  error: {
    label: "Error",
    glyph: "!",
    text: "text-neg",
    border: "border-neg/30",
    surface: "bg-neg/[0.04]",
    dot: "bg-neg",
  },
};
