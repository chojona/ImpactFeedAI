import type { EventCategory, EventTypeName } from "@/types/events";

/**
 * Per-category display + interpretation config.
 *
 * `higherIsBetter` drives surprise colouring: it answers "is a number above
 * consensus good news for risk assets?". Always derive surprise direction from
 * this flag rather than comparing `actualValue > expectedValue` directly —
 * a hot CPI print is a *negative* surprise even though the number is higher.
 *
 * Known limitation: the flag is per *category*, so it cannot distinguish
 * payrolls (more jobs is good) from the unemployment rate (higher is bad) —
 * both are `EventType.NFP` → `JOBS`. This is currently harmless because only
 * hand-curated events carry a consensus value, and every curated JOBS event is
 * a payrolls print; FRED and BLS publish actuals only, so unemployment-rate
 * rows have no `expectedValue` and render no surprise at all. Resolving it
 * properly means a per-metric override, which is only worth adding once a
 * consensus source exists.
 */
export const CATEGORY_CONFIG: Record<
  EventCategory,
  { higherIsBetter: boolean; color: string }
> = {
  TARIFF: { higherIsBetter: false, color: "#FF6B35" },
  FED: { higherIsBetter: false, color: "#A78BFA" },
  INFLATION: { higherIsBetter: false, color: "#EF4444" },
  JOBS: { higherIsBetter: true, color: "#22D3EE" },
  GEOPOLITICAL: { higherIsBetter: false, color: "#F59E0B" },
  EARNINGS: { higherIsBetter: true, color: "#3B82F6" },
  OTHER: { higherIsBetter: true, color: "#6B7280" },
};

/**
 * Storage vocabulary → display vocabulary. Many-to-one: CPI and PPI are both
 * inflation prints, and MACRO_DATA is the catch-all for releases with no
 * dedicated category yet (GDP, sentiment surveys).
 */
const EVENT_TYPE_TO_CATEGORY: Record<EventTypeName, EventCategory> = {
  TARIFF: "TARIFF",
  FED_DECISION: "FED",
  CPI: "INFLATION",
  PPI: "INFLATION",
  NFP: "JOBS",
  GEOPOLITICAL: "GEOPOLITICAL",
  EARNINGS_SURPRISE: "EARNINGS",
  MACRO_DATA: "OTHER",
};

export const categoryForEventType = (type: EventTypeName): EventCategory =>
  EVENT_TYPE_TO_CATEGORY[type];

const CATEGORY_TO_EVENT_TYPES: Record<EventCategory, EventTypeName[]> = (() => {
  const out = {} as Record<EventCategory, EventTypeName[]>;
  for (const category of Object.keys(CATEGORY_CONFIG) as EventCategory[]) {
    out[category] = [];
  }
  for (const [type, category] of Object.entries(EVENT_TYPE_TO_CATEGORY) as [
    EventTypeName,
    EventCategory,
  ][]) {
    out[category].push(type);
  }
  return out;
})();

/**
 * The `EventType` values a category filter should match. Used to turn a UI
 * filter into a Prisma `where` clause without a second source of truth.
 */
export const eventTypesForCategory = (
  category: EventCategory,
): readonly EventTypeName[] => CATEGORY_TO_EVENT_TYPES[category];

/** Categories offered as filters, in display order. */
export const FILTERABLE_CATEGORIES: readonly EventCategory[] = [
  "TARIFF",
  "INFLATION",
  "FED",
  "JOBS",
  "GEOPOLITICAL",
  "EARNINGS",
  "OTHER",
];
