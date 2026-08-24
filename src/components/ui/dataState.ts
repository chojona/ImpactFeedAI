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
 * The second visual pass moved the fills onto the shared tint tokens and gave
 * each state an `iconChip` — a bordered, tinted container for its glyph. That
 * container is doing real work: it gives the panel a focal point at a fixed
 * position, which is what turns "a paragraph in a coloured box" into something
 * that reads as a status. Informational states (`pending`) borrow the brand
 * indigo rather than a fourth blue, so the palette stays at one interactive
 * hue.
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
  /** Panel/chip fill. A tint token, never a saturated block. */
  surface: string;
  /** Solid dot / bar colour, for legends and status dots. */
  dot: string;
  /** Border + fill + colour for the icon container on a state panel. */
  iconChip: string;
}

export const DATA_STATE: Readonly<Record<DataState, DataStateStyle>> = {
  measured: {
    label: "Measured",
    glyph: "●",
    text: "text-pos",
    border: "border-pos/25",
    surface: "bg-pos-tint",
    dot: "bg-pos",
    iconChip: "border-pos/30 bg-pos/10 text-pos",
  },
  partial: {
    label: "Partly measured",
    glyph: "◐",
    text: "text-warn",
    border: "border-warn/28",
    surface: "bg-warn-tint",
    dot: "bg-warn",
    iconChip: "border-warn/30 bg-warn/10 text-warn",
  },
  unavailable: {
    label: "Not measured",
    glyph: "—",
    text: "text-ink-3",
    border: "border-line",
    surface: "bg-surface-1",
    dot: "bg-unmeasured",
    iconChip: "border-line-strong bg-surface-2 text-ink-3",
  },
  suppressed: {
    label: "Withheld",
    glyph: "⦸",
    text: "text-warn",
    border: "border-warn/28",
    surface: "bg-warn-tint",
    dot: "bg-warn",
    iconChip: "border-warn/30 bg-warn/10 text-warn",
  },
  unsupported: {
    label: "Not published",
    glyph: "∅",
    text: "text-ink-3",
    border: "border-line",
    surface: "bg-surface-1",
    dot: "bg-unmeasured",
    iconChip: "border-line-strong bg-surface-2 text-ink-3",
  },
  pending: {
    label: "Not ingested yet",
    glyph: "◌",
    text: "text-info",
    border: "border-brand/28",
    surface: "bg-brand-tint",
    dot: "bg-info",
    iconChip: "border-brand/35 bg-brand/12 text-info",
  },
  error: {
    label: "Error",
    glyph: "!",
    text: "text-neg",
    border: "border-neg/32",
    surface: "bg-neg-tint",
    dot: "bg-neg",
    iconChip: "border-neg/35 bg-neg/10 text-neg",
  },
};
