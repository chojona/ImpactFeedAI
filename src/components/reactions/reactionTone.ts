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
export const FLAT_COLOR = "#A1A1AA";
export const UNMEASURED_COLOR = "#3F3F46";

export const moveColor = (value: number | null): string => {
  const direction = directionOf(value);
  if (direction === "UP") return UP_COLOR;
  if (direction === "DOWN") return DOWN_COLOR;
  if (direction === "FLAT") return FLAT_COLOR;
  return UNMEASURED_COLOR;
};

export const moveTextClass = (value: number | null): string => {
  const direction = directionOf(value);
  if (direction === "UP") return "text-[#00FF94]";
  if (direction === "DOWN") return "text-[#FF5C5C]";
  if (direction === "FLAT") return "text-zinc-300";
  return "text-zinc-600";
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
  // Floor the alpha so a small but real move still reads as measured.
  const alpha = (0.06 + intensity * 0.26).toFixed(3);
  if (value === 0) return { backgroundColor: `rgba(161, 161, 170, 0.08)` };
  return value > 0
    ? { backgroundColor: `rgba(0, 255, 148, ${alpha})` }
    : { backgroundColor: `rgba(255, 92, 92, ${alpha})` };
}
