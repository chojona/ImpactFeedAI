/**
 * Colour treatment for a measured move.
 *
 * Deliberately restrained: the palette carries direction, not emphasis. An
 * unmeasured value gets the muted class and the caller renders an em dash, so
 * "we did not measure this" never looks like a small move.
 */
import type { Direction } from "@/types/events";

export const directionOf = (value: number | null): Direction | null => {
  if (value === null || !Number.isFinite(value)) return null;
  if (value > 0) return "UP";
  if (value < 0) return "DOWN";
  return "FLAT";
};

export const UP_COLOR = "#00FF94";
export const DOWN_COLOR = "#FF5C5C";
export const FLAT_COLOR = "#B8C2D9";
export const UNMEASURED_COLOR = "#55607A";

export const moveColor = (value: number | null): string => {
  const direction = directionOf(value);
  if (direction === "UP") return UP_COLOR;
  if (direction === "DOWN") return DOWN_COLOR;
  if (direction === "FLAT") return FLAT_COLOR;
  return UNMEASURED_COLOR;
};

export const moveTextClass = (value: number | null): string => {
  const direction = directionOf(value);
  if (direction === "UP") return "text-pos";
  if (direction === "DOWN") return "text-neg";
  if (direction === "FLAT") return "text-flat";
  // Unmeasured. `text-ink-4` clears 5:1 against the page, where the previous
  // `text-zinc-600` sat near 2.4:1 — the state a reader most needs to notice
  // was the hardest one on the page to read.
  return "text-ink-4";
};

/**
 * Text colour for a value sitting *on* a heat tint.
 *
 * The base `moveTextClass` colours are tuned for an untinted surface. On the
 * strongest cell the heatmap can produce they fall to roughly 2.9:1, so the one
 * place where a percentage is drawn over its own colour gets a lighter step.
 * Unmeasured and flat readings are unchanged — they are never tinted.
 */
export const moveTextOnTintClass = (value: number | null): string => {
  const direction = directionOf(value);
  if (direction === "UP") return "text-pos-on-tint";
  if (direction === "DOWN") return "text-neg-on-tint";
  if (direction === "FLAT") return "text-flat";
  return "text-ink-4";
};

/**
 * Background tint for a heatmap cell, scaled by move size relative to the
 * largest move in the same table. Returns null for an unmeasured reading —
 * an unmeasured cell gets no fill at all, which is what distinguishes it from
 * a measured 0.00%.
 */
export function heatCellStyle(
  value: number | null,
  maxAbs: number | null,
): { backgroundColor: string } | undefined {
  if (value === null || maxAbs === null || maxAbs <= 0) return undefined;
  const intensity = Math.min(1, Math.abs(value) / maxAbs);
  // Floor the alpha so a small but real move still reads as measured. Both
  // numbers went up in the second visual pass: the surfaces underneath these
  // cells are lighter now, so the old 0.06 floor had stopped being visible.
  const alpha = (0.09 + intensity * 0.2).toFixed(3);
  // A measured flat reading gets a blue-grey wash rather than a red or green
  // one — it is a real observation, and it is not a direction.
  if (value === 0) return { backgroundColor: `rgba(150, 176, 255, 0.1)` };
  return value > 0
    ? { backgroundColor: `rgba(0, 255, 148, ${alpha})` }
    : { backgroundColor: `rgba(255, 92, 92, ${alpha})` };
}
