/**
 * Canonical macro metric registry — the single source of truth for what a
 * metric *means* and what unit it is stored in.
 *
 * Why this exists: the curated pipeline (`fetch-macro.ts`) and the bulk
 * pipeline (`sources-fred.ts` / `sources-bls.ts`) previously each decided how
 * to turn a raw source observation into a headline number. The curated path
 * had no transformation at all, so it stored raw index levels (CPI ≈ 294.9)
 * against hand-curated consensus values expressed as percentages (8.8),
 * producing meaningless surprises. Both paths now derive values here.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE INVARIANT
 *
 *   For any single DataRelease row, `expectedValue`, `actualValue`,
 *   `priorValue` and `surpriseMagnitude` MUST all be in the metric's
 *   canonical unit. Never mix a raw source level with a headline consensus.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `canonicalName` is written to `DataRelease.metricName` and is stable across
 * sources: FRED's CPIAUCNS and BLS's CUUR0000SA0 both resolve to the same
 * canonical name, which is what lets deduplication recognise them as the same
 * economic release while keeping headline CPI and Core CPI distinct.
 *
 * This module lives under `src/` rather than `scripts/` because both consumers
 * need it: the ingestion CLIs derive values with it, and the web app formats
 * stored `DataRelease` rows with it. A stored number is meaningless without the
 * unit that produced it, so the registry has to be shared rather than copied.
 */

import type { EventTypeName } from "@/types/events";

/** How a raw source series is converted into its headline number. */
export type MetricTransform =
  | "yoy_pct" // monthly index → year-over-year % change
  | "qoq_pct_annualized" // quarterly level → QoQ % annualised
  | "mom_diff_thousands" // level in thousands → month-over-month change
  | "level_pct" // already a percentage (unemployment, fed funds)
  | "level"; // already a meaningful number (sentiment index)

export type MetricUnit =
  | "pct_yoy"
  | "pct_saar"
  | "thousands_mom"
  | "pct_level"
  | "index_points";

/**
 * Seasonal-adjustment basis of the series that produces this headline.
 *
 * Declared explicitly so an SA actual is never paired with an NSA expectation
 * (or the reverse). `na` covers levels that are not seasonally adjusted in the
 * BLS/FRED sense (policy rates, sentiment indexes).
 */
export type SeasonalAdjustment = "SA" | "NSA" | "na";

export interface CanonicalMetric {
  /** Stable identity across every source. Never persisted; used for dedup keys. */
  key: string;
  /** Persisted to DataRelease.metricName. Identical across sources. */
  canonicalName: string;
  eventType: EventTypeName;
  transform: MetricTransform;
  unit: MetricUnit;
  /** Human-readable unit, used in logs and smoke tests. */
  unitLabel: string;
  /** Subject noun used when generating headlines. */
  headlineNoun: string;
  /** Adjustment basis of the bound source series for this headline. */
  seasonalAdjustment: SeasonalAdjustment;
}

const define = <T extends Record<string, CanonicalMetric>>(m: T): T => m;

export const METRICS = define({
  CPI_HEADLINE: {
    key: "CPI_HEADLINE",
    canonicalName: "CPI (headline, YoY)",
    eventType: "CPI",
    transform: "yoy_pct",
    unit: "pct_yoy",
    unitLabel: "% YoY",
    headlineNoun: "CPI",
    seasonalAdjustment: "NSA",
  },
  CPI_CORE: {
    key: "CPI_CORE",
    canonicalName: "Core CPI (ex food & energy, YoY)",
    eventType: "CPI",
    transform: "yoy_pct",
    unit: "pct_yoy",
    unitLabel: "% YoY",
    headlineNoun: "Core CPI",
    seasonalAdjustment: "NSA",
  },
  PPI_HEADLINE: {
    key: "PPI_HEADLINE",
    canonicalName: "PPI (final demand, YoY)",
    eventType: "PPI",
    transform: "yoy_pct",
    unit: "pct_yoy",
    unitLabel: "% YoY",
    headlineNoun: "PPI",
    // BLS Table A: "Change in final demand from 12 months ago (unadj.)".
    seasonalAdjustment: "NSA",
  },
  PCE_HEADLINE: {
    key: "PCE_HEADLINE",
    canonicalName: "PCE price index (headline, YoY)",
    eventType: "CPI",
    transform: "yoy_pct",
    unit: "pct_yoy",
    unitLabel: "% YoY",
    headlineNoun: "PCE",
    seasonalAdjustment: "SA",
  },
  PCE_CORE: {
    key: "PCE_CORE",
    canonicalName: "Core PCE price index (YoY)",
    eventType: "CPI",
    transform: "yoy_pct",
    unit: "pct_yoy",
    unitLabel: "% YoY",
    headlineNoun: "Core PCE",
    seasonalAdjustment: "SA",
  },
  PAYROLLS: {
    key: "PAYROLLS",
    canonicalName: "Nonfarm payrolls (MoM change)",
    eventType: "NFP",
    transform: "mom_diff_thousands",
    unit: "thousands_mom",
    unitLabel: "k jobs (MoM)",
    headlineNoun: "Nonfarm payrolls",
    seasonalAdjustment: "SA",
  },
  UNEMPLOYMENT_RATE: {
    key: "UNEMPLOYMENT_RATE",
    canonicalName: "Unemployment rate",
    eventType: "NFP",
    transform: "level_pct",
    unit: "pct_level",
    unitLabel: "%",
    headlineNoun: "Unemployment rate",
    seasonalAdjustment: "SA",
  },
  JOLTS_OPENINGS: {
    key: "JOLTS_OPENINGS",
    canonicalName: "JOLTS job openings (MoM change)",
    eventType: "NFP",
    transform: "mom_diff_thousands",
    unit: "thousands_mom",
    unitLabel: "k openings (MoM)",
    headlineNoun: "Job openings",
    seasonalAdjustment: "SA",
  },
  FED_TARGET_UPPER: {
    key: "FED_TARGET_UPPER",
    canonicalName: "Fed funds target rate (upper bound)",
    eventType: "FED_DECISION",
    transform: "level_pct",
    unit: "pct_level",
    unitLabel: "%",
    headlineNoun: "Fed funds target (upper bound)",
    seasonalAdjustment: "na",
  },
  FED_FUNDS_EFFECTIVE: {
    key: "FED_FUNDS_EFFECTIVE",
    canonicalName: "Effective federal funds rate (monthly average)",
    eventType: "FED_DECISION",
    transform: "level_pct",
    unit: "pct_level",
    unitLabel: "%",
    headlineNoun: "Effective Fed funds rate",
    seasonalAdjustment: "na",
  },
  GDP_REAL: {
    key: "GDP_REAL",
    canonicalName: "Real GDP growth (QoQ, annualised)",
    eventType: "MACRO_DATA",
    transform: "qoq_pct_annualized",
    unit: "pct_saar",
    unitLabel: "% QoQ SAAR",
    headlineNoun: "Real GDP",
    seasonalAdjustment: "SA",
  },
  UMICH_SENTIMENT: {
    key: "UMICH_SENTIMENT",
    canonicalName: "UMich consumer sentiment (index)",
    eventType: "MACRO_DATA",
    transform: "level",
    unit: "index_points",
    unitLabel: "index",
    headlineNoun: "UMich Consumer Sentiment",
    seasonalAdjustment: "na",
  },
});

export interface SeriesBinding {
  seriesId: string;
  metric: CanonicalMetric;
}

/** FRED series → canonical metric. Used by the bulk pipeline. */
export const FRED_SERIES_BINDINGS: readonly SeriesBinding[] = [
  // NSA: headline YoY inflation is quoted unadjusted. The SA series gives
  // 9.0% for Jun-2022 where the official print was 9.1% — a systematic ~0.1pp
  // bias, material when surprises are routinely 0.1–0.3pp.
  { seriesId: "CPIAUCNS", metric: METRICS.CPI_HEADLINE },
  { seriesId: "CPILFENS", metric: METRICS.CPI_CORE },
  // Final Demand NSA (PPIFID): BLS Table A quotes the 12-month change
  // unadjusted. PPIFIS is the SA index and must not back a headline YoY —
  // an SA actual vs an NSA consensus is a unit mismatch. PPIACO (all
  // commodities) is a different, far more volatile index: -0.8% vs the
  // 2.1% actually printed for Mar-2024.
  { seriesId: "PPIFID", metric: METRICS.PPI_HEADLINE },
  { seriesId: "PAYEMS", metric: METRICS.PAYROLLS },
  { seriesId: "UNRATE", metric: METRICS.UNEMPLOYMENT_RATE },
  { seriesId: "FEDFUNDS", metric: METRICS.FED_FUNDS_EFFECTIVE },
  // PCEPI is the price index. The bare "PCE" series is nominal consumer
  // SPENDING in $bn — a YoY on it returned 5.7% where PCE inflation was 2.9%.
  { seriesId: "PCEPI", metric: METRICS.PCE_HEADLINE },
  { seriesId: "PCEPILFE", metric: METRICS.PCE_CORE },
  { seriesId: "GDPC1", metric: METRICS.GDP_REAL },
  { seriesId: "UMCSENT", metric: METRICS.UMICH_SENTIMENT },
  // NB: the spec wrote "JOLTS"; the real FRED id is JTSJOL.
  { seriesId: "JTSJOL", metric: METRICS.JOLTS_OPENINGS },
];

/**
 * BLS series → canonical metric. Deliberately resolves to the SAME canonical
 * metrics as the FRED bindings above, so dedup treats a BLS CPI-U print and a
 * FRED CPIAUCNS print as one economic release.
 *
 * Inflation series are NSA to match how headline YoY is quoted; employment
 * series stay SA because payrolls and the unemployment rate are quoted SA.
 * All four series IDs were verified live against the BLS API.
 */
export const BLS_SERIES_BINDINGS: readonly SeriesBinding[] = [
  { seriesId: "CUUR0000SA0", metric: METRICS.CPI_HEADLINE },
  { seriesId: "CUUR0000SA0L1E", metric: METRICS.CPI_CORE },
  { seriesId: "CES0000000001", metric: METRICS.PAYROLLS },
  { seriesId: "LNS14000000", metric: METRICS.UNEMPLOYMENT_RATE },
];

/**
 * Curated-event type → the FRED series used to resolve its actual/prior.
 *
 * Only release-type events map here. TARIFF / GEOPOLITICAL / EARNINGS_SURPRISE
 * / MACRO_DATA have no single authoritative series, so they produce no
 * DataRelease from FRED.
 */
export const CURATED_SERIES_BY_EVENT_TYPE: Partial<
  Record<EventTypeName, SeriesBinding>
> = {
  CPI: { seriesId: "CPIAUCNS", metric: METRICS.CPI_HEADLINE },
  PPI: { seriesId: "PPIFID", metric: METRICS.PPI_HEADLINE },
  NFP: { seriesId: "PAYEMS", metric: METRICS.PAYROLLS },
  FED_DECISION: { seriesId: "DFEDTARU", metric: METRICS.FED_TARGET_UPPER },
};

/* ──────────────────────── source window sizing ──────────────────────── */

/**
 * How many observations of history a transform needs *before* the one it is
 * deriving. `yoy_pct` needs 13: index−12 for the year-ago comparison and
 * index−13 so the previous month's YoY (the `prior`) is also computable.
 */
export function transformLookback(transform: MetricTransform): number {
  switch (transform) {
    case "yoy_pct":
      return 13;
    case "qoq_pct_annualized":
      return 2;
    case "mom_diff_thousands":
      return 2;
    case "level_pct":
    case "level":
      return 1;
  }
}

/** Observation spacing implied by a transform. */
export function transformPeriodMonths(transform: MetricTransform): number {
  return transform === "qoq_pct_annualized" ? 3 : 1;
}

/**
 * Earliest observation date a source must fetch so that an event dated `since`
 * is actually derivable.
 *
 * Without this, `--since 2024-01-01` silently produced no CPI events until
 * 2025-01: the fetch started at the cutoff, so the first 13 observations had no
 * year-ago comparison and `deriveMetric` returned null for every one of them.
 * A whole year of the requested range went missing with no warning. Callers
 * fetch from here and let the orchestrator drop candidates before `since`.
 */
export function observationStartFor(
  metric: CanonicalMetric,
  since: string,
): string {
  const months =
    transformLookback(metric.transform) *
    transformPeriodMonths(metric.transform);
  const d = new Date(`${since}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return since;
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

/* ─────────────────────────── transformation ─────────────────────────── */

export interface Observation {
  /** ISO date (YYYY-MM-DD) of the observation's *reference period*. */
  iso: string;
  value: number | null;
}

export interface DerivedMetric {
  /** Headline value in the metric's canonical unit. */
  value: number;
  /** Previous period's headline value, same unit. Null when unavailable. */
  prior: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

export type CalendarPeriodGranularity = "month" | "quarter";

/**
 * Shift a reference-period ISO date by a whole number of calendar months.
 *
 * Returns null when `iso` is not a usable calendar date so callers can skip
 * the row instead of aborting a bulk ingest with RangeError.
 */
export function shiftReferencePeriod(
  iso: string,
  deltaMonths: number,
): string | null {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + deltaMonths);
  return d.toISOString().slice(0, 10);
}

/**
 * Period identity for calendar lookups: year+month, or year+quarter.
 *
 * Day-of-month is ignored so Feb 29 matches Feb 28 of the prior year and a
 * quarter-end observation matches a quarter-start one in the same quarter.
 * Malformed dates return null (unusable), never throw.
 */
export function calendarPeriodKey(
  iso: string,
  granularity: CalendarPeriodGranularity,
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  // Reject impossible civil dates (e.g. 2023-02-29) via UTC round-trip.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(probe.getTime()) ||
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  if (granularity === "month") return `${year}-${String(month).padStart(2, "0")}`;
  const quarter = Math.floor((month - 1) / 3) + 1;
  return `${year}-Q${quarter}`;
}

/**
 * Look up an observation by calendar period identity (not exact day-of-month).
 *
 * Absent period → null (unknown). A present row with a null value is also
 * unknown. Never fall back to the nearest neighbour: a missing October must
 * not make September look like November's prior.
 */
function valueAtPeriod(
  obs: readonly Observation[],
  targetIso: string | null,
  granularity: CalendarPeriodGranularity,
): number | null {
  if (targetIso === null) return null;
  const targetKey = calendarPeriodKey(targetIso, granularity);
  if (targetKey === null) return null;
  const row = obs.find(
    (o) => calendarPeriodKey(o.iso, granularity) === targetKey,
  );
  return row?.value ?? null;
}

/**
 * Convert the observation at `index` into its canonical headline value.
 *
 * Period comparisons use calendar identity (previous month / same month prior
 * year / previous quarter), not array offsets or exact day-of-month. A missing
 * or malformed period yields null rather than the nearest neighbour or a throw.
 */
export function deriveMetric(
  transform: MetricTransform,
  index: number,
  obs: readonly Observation[],
): DerivedMetric | null {
  const current = obs[index];
  if (!current) return null;
  const here = current.value;
  if (here === null) return null;

  const granularity: CalendarPeriodGranularity =
    transform === "qoq_pct_annualized" ? "quarter" : "month";
  if (calendarPeriodKey(current.iso, granularity) === null) return null;

  switch (transform) {
    case "yoy_pct": {
      const ya = valueAtPeriod(
        obs,
        shiftReferencePeriod(current.iso, -12),
        "month",
      );
      if (ya === null || ya === 0) return null;
      const yoy = ((here - ya) / ya) * 100;

      let prior: number | null = null;
      const priorLevel = valueAtPeriod(
        obs,
        shiftReferencePeriod(current.iso, -1),
        "month",
      );
      const priorYearAgo = valueAtPeriod(
        obs,
        shiftReferencePeriod(current.iso, -13),
        "month",
      );
      if (
        priorLevel !== null &&
        priorYearAgo !== null &&
        priorYearAgo !== 0
      ) {
        prior = ((priorLevel - priorYearAgo) / priorYearAgo) * 100;
      }
      return { value: round1(yoy), prior: prior === null ? null : round1(prior) };
    }

    case "qoq_pct_annualized": {
      const last = valueAtPeriod(
        obs,
        shiftReferencePeriod(current.iso, -3),
        "quarter",
      );
      if (last === null || last === 0) return null;
      const ann = (Math.pow(here / last, 4) - 1) * 100;

      let prior: number | null = null;
      const beforeLast = valueAtPeriod(
        obs,
        shiftReferencePeriod(current.iso, -6),
        "quarter",
      );
      if (beforeLast !== null && beforeLast !== 0) {
        prior = (Math.pow(last / beforeLast, 4) - 1) * 100;
      }
      return { value: round1(ann), prior: prior === null ? null : round1(prior) };
    }

    case "mom_diff_thousands": {
      const last = valueAtPeriod(
        obs,
        shiftReferencePeriod(current.iso, -1),
        "month",
      );
      if (last === null) return null;

      let prior: number | null = null;
      const beforeLast = valueAtPeriod(
        obs,
        shiftReferencePeriod(current.iso, -2),
        "month",
      );
      if (beforeLast !== null) prior = Math.round(last - beforeLast);
      return { value: Math.round(here - last), prior };
    }

    case "level_pct":
    case "level": {
      const p = valueAtPeriod(
        obs,
        shiftReferencePeriod(current.iso, -1),
        "month",
      );
      return { value: round2(here), prior: p === null ? null : round2(p) };
    }
  }
}

/** Difference in the metric's canonical unit. Null unless both sides exist. */
export function computeSurpriseInCanonicalUnit(
  actual: number | null,
  expected: number | null,
): number | null {
  if (actual === null || expected === null) return null;
  return Math.round((actual - expected) * 1e4) / 1e4;
}

/* ───────────────────────── headline generation ──────────────────────── */

function headlineTolerance(transform: MetricTransform): number {
  switch (transform) {
    case "yoy_pct":
    case "qoq_pct_annualized":
      return 0.05;
    case "mom_diff_thousands":
      return 5;
    case "level_pct":
      return 0.01;
    case "level":
      return 0.5;
  }
}

/**
 * Direction of a print against its prior, or null when there is no prior to
 * compare against.
 *
 * Null is deliberately distinct from "in line with". A missing prior is an
 * unknown, not an unchanged reading — BLS returned no October 2025
 * unemployment observation at all, and the previous behaviour rendered the
 * November print as "in line with prior", asserting a comparison that had
 * never been made.
 */
export function directionVsPrior(
  current: number,
  prior: number | null,
  tolerance: number,
): "above" | "below" | "in line with" | null {
  if (prior === null) return null;
  const diff = current - prior;
  if (Math.abs(diff) <= tolerance) return "in line with";
  return diff > 0 ? "above" : "below";
}

function formatMonth(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function quarterLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
}

/**
 * Shared headline text so FRED and BLS prints of the same metric read alike.
 *
 * The "— above/below/in line with prior" clause is omitted entirely when the
 * prior is unknown, rather than defaulting to a comparison that was never made.
 */
export function makeMetricHeadline(
  metric: CanonicalMetric,
  value: number,
  prior: number | null,
  iso: string,
): string {
  const dir = directionVsPrior(value, prior, headlineTolerance(metric.transform));
  const vsPrior = dir === null ? "" : ` — ${dir} prior`;
  switch (metric.transform) {
    case "yoy_pct":
      return `${metric.headlineNoun} prints ${value.toFixed(1)}% YoY${vsPrior} (${formatMonth(iso)})`;
    case "qoq_pct_annualized":
      return `${metric.headlineNoun} ${value >= 0 ? "+" : ""}${value.toFixed(1)}% annualised${vsPrior} (${quarterLabel(iso)})`;
    case "mom_diff_thousands": {
      const sign = value >= 0 ? "+" : "";
      const formatted = `${sign}${Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(0)}M` : `${value}k`}`;
      return `${metric.headlineNoun} ${formatted}${vsPrior} (${formatMonth(iso)})`;
    }
    case "level_pct":
      return `${metric.headlineNoun} ${value.toFixed(2)}%${vsPrior} (${formatMonth(iso)})`;
    case "level":
      return `${metric.headlineNoun} ${value.toFixed(1)}${vsPrior} (${formatMonth(iso)})`;
  }
}

/** Format a value with its unit, for logs and smoke tests. */
export function formatWithUnit(
  metric: CanonicalMetric,
  value: number | null,
): string {
  if (value === null) return "null";
  switch (metric.unit) {
    case "pct_yoy":
    case "pct_saar":
      return `${value.toFixed(1)}% ${metric.unit === "pct_saar" ? "SAAR" : "YoY"}`;
    case "pct_level":
      return `${value.toFixed(2)}%`;
    case "thousands_mom":
      return `${value >= 0 ? "+" : ""}${value}k`;
    case "index_points":
      return value.toFixed(1);
  }
}

/* ─────────────────────── reading stored rows back ───────────────────── */

const BY_CANONICAL_NAME: ReadonlyMap<string, CanonicalMetric> = new Map(
  Object.values(METRICS).map((m) => [m.canonicalName, m]),
);

/**
 * Resolve a stored `DataRelease.metricName` back to its canonical metric.
 *
 * Returns undefined for names this registry does not know — rows written before
 * a metric was renamed, or a hand-entered `metricName` override on a curated
 * seed event. Callers must degrade to a unit-less display rather than guessing
 * a unit, because guessing is how a percentage gets rendered as index points.
 */
export function metricByCanonicalName(
  name: string,
): CanonicalMetric | undefined {
  return BY_CANONICAL_NAME.get(name);
}

/**
 * Format a stored value for display, in the unit the metric is stored in.
 *
 * Falls back to a plain number when the metric is unknown: a bare `3.5` is
 * honest about what is known, where `3.5%` would be an assertion.
 */
export function formatMetricValue(
  metricName: string,
  value: number | null,
): string | null {
  if (value === null) return null;
  const metric = metricByCanonicalName(metricName);
  if (!metric) return String(value);
  switch (metric.unit) {
    case "pct_yoy":
    case "pct_saar":
      return `${value.toFixed(1)}%`;
    case "pct_level":
      return `${value.toFixed(2)}%`;
    case "thousands_mom":
      return `${value >= 0 ? "+" : ""}${Math.round(value)}k`;
    case "index_points":
      return value.toFixed(1);
  }
}

/**
 * Format a surprise (actual − expected). Percentage metrics are quoted in
 * percentage *points*, not percent: a 2.4% consensus printing 2.3% is a
 * −0.1pp surprise, and calling it −0.1% would imply a relative change.
 */
export function formatMetricSurprise(
  metricName: string,
  value: number | null,
): string | null {
  if (value === null) return null;
  const sign = value > 0 ? "+" : "";
  const metric = metricByCanonicalName(metricName);
  if (!metric) return `${sign}${value}`;
  switch (metric.unit) {
    case "pct_yoy":
    case "pct_saar":
    case "pct_level":
      return `${sign}${Number(value.toFixed(2))}pp`;
    case "thousands_mom":
      return `${sign}${Math.round(value)}k`;
    case "index_points":
      return `${sign}${value.toFixed(1)}`;
  }
}
