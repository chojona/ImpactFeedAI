import type { EventCategory } from "@/types/events";

/**
 * Per-category display + interpretation config.
 *
 * `higherIsBetter` drives surprise colouring: it answers "is a number above
 * consensus good news for risk assets?". Always derive surprise direction from
 * this flag rather than comparing `actualValue > expectedValue` directly —
 * a hot CPI print is a *negative* surprise even though the number is higher.
 */
export const CATEGORY_CONFIG: Record<
  EventCategory,
  { higherIsBetter: boolean; color: string }
> = {
  TARIFF: { higherIsBetter: false, color: "#FF6B35" },
  FED: { higherIsBetter: false, color: "#A78BFA" },
  INFLATION: { higherIsBetter: false, color: "#EF4444" },
  GEOPOLITICAL: { higherIsBetter: false, color: "#F59E0B" },
  EARNINGS: { higherIsBetter: true, color: "#3B82F6" },
  OTHER: { higherIsBetter: true, color: "#6B7280" },
};
