import type { EventCategory, EventTypeName } from "@/types/events";

/**
 * Per-category display + interpretation config.
 *
 * `higherIsBetter` drives surprise colouring: it answers "is a number above
 * consensus good news for risk assets?". Always derive surprise direction from
 * this flag rather than comparing `actualValue > expectedValue` directly —
 * a hot CPI print is a *negative* surprise even though the number is higher.
 *
 * ### Category colour
 *
 * Taxonomic only — a category colour never means anything about a market. That
 * constraint is what sets the palette: every hue here is kept clear of the two
 * colours a reader is allowed to interpret as a fact (`--color-pos` #00FF94 at
 * 155° and `--color-neg` #FF5C5C at 0°) and of the brand indigo at 231°, which
 * carries interaction.
 *
 * The previous set violated that twice over. INFLATION was #EF4444 — a red
 * within a few degrees of the negative-move red, so an INFLATION chip beside a
 * −1.58% reading was two reds meaning two unrelated things. GEOPOLITICAL was
 * #F59E0B, effectively the warning amber. EARNINGS was #3B82F6, which is now
 * the brand's lane. The hues below spread across 23°, 72°, 175°, 213°, 258°,
 * 310° and 340°, so no two categories collide and none of them borrows a
 * meaning it does not have.
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
  TARIFF: { higherIsBetter: false, color: "#F2789E" },
  FED: { higherIsBetter: false, color: "#A78BFA" },
  INFLATION: { higherIsBetter: false, color: "#F98C4A" },
  JOBS: { higherIsBetter: true, color: "#48C2B4" },
  GEOPOLITICAL: { higherIsBetter: false, color: "#E36FD4" },
  EARNINGS: { higherIsBetter: true, color: "#B7CC5C" },
  OTHER: { higherIsBetter: true, color: "#94A3B8" },
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
