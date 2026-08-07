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
 */

import type { EventTypeLiteral } from "./auto-ingest-types";

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

export interface CanonicalMetric {
  /** Stable identity across every source. Never persisted; used for dedup keys. */
  key: string;
  /** Persisted to DataRelease.metricName. Identical across sources. */
  canonicalName: string;
  eventType: EventTypeLiteral;
  transform: MetricTransform;
  unit: MetricUnit;
  /** Human-readable unit, used in logs and smoke tests. */
  unitLabel: string;
  /** Subject noun used when generating headlines. */
  headlineNoun: string;
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
  },
  CPI_CORE: {
    key: "CPI_CORE",
    canonicalName: "Core CPI (ex food & energy, YoY)",
    eventType: "CPI",
    transform: "yoy_pct",
    unit: "pct_yoy",
    unitLabel: "% YoY",
    headlineNoun: "Core CPI",
  },
  PPI_HEADLINE: {
    key: "PPI_HEADLINE",
    canonicalName: "PPI (final demand, YoY)",
    eventType: "PPI",
    transform: "yoy_pct",
    unit: "pct_yoy",
    unitLabel: "% YoY",
    headlineNoun: "PPI",
  },
  PCE_HEADLINE: {
    key: "PCE_HEADLINE",
    canonicalName: "PCE price index (headline, YoY)",
    eventType: "CPI",
    transform: "yoy_pct",
    unit: "pct_yoy",
    unitLabel: "% YoY",
    headlineNoun: "PCE",
  },
  PCE_CORE: {
    key: "PCE_CORE",
    canonicalName: "Core PCE price index (YoY)",
    eventType: "CPI",
    transform: "yoy_pct",
    unit: "pct_yoy",
    unitLabel: "% YoY",
    headlineNoun: "Core PCE",
  },
  PAYROLLS: {
    key: "PAYROLLS",
    canonicalName: "Nonfarm payrolls (MoM change)",
    eventType: "NFP",
    transform: "mom_diff_thousands",
    unit: "thousands_mom",
    unitLabel: "k jobs (MoM)",
    headlineNoun: "Nonfarm payrolls",
  },
  UNEMPLOYMENT_RATE: {
    key: "UNEMPLOYMENT_RATE",
    canonicalName: "Unemployment rate",
    eventType: "NFP",
    transform: "level_pct",
    unit: "pct_level",
    unitLabel: "%",
    headlineNoun: "Unemployment rate",
  },
  JOLTS_OPENINGS: {
    key: "JOLTS_OPENINGS",
    canonicalName: "JOLTS job openings (MoM change)",
    eventType: "NFP",
    transform: "mom_diff_thousands",
    unit: "thousands_mom",
    unitLabel: "k openings (MoM)",
    headlineNoun: "Job openings",
  },
  FED_TARGET_UPPER: {
    key: "FED_TARGET_UPPER",
    canonicalName: "Fed funds target rate (upper bound)",
    eventType: "FED_DECISION",
    transform: "level_pct",
    unit: "pct_level",
    unitLabel: "%",
    headlineNoun: "Fed funds target (upper bound)",
  },
  FED_FUNDS_EFFECTIVE: {
    key: "FED_FUNDS_EFFECTIVE",
    canonicalName: "Effective federal funds rate (monthly average)",
    eventType: "FED_DECISION",
    transform: "level_pct",
    unit: "pct_level",
    unitLabel: "%",
    headlineNoun: "Effective Fed funds rate",
  },
  GDP_REAL: {
    key: "GDP_REAL",
    canonicalName: "Real GDP growth (QoQ, annualised)",
    eventType: "MACRO_DATA",
    transform: "qoq_pct_annualized",
    unit: "pct_saar",
    unitLabel: "% QoQ SAAR",
    headlineNoun: "Real GDP",
  },
  UMICH_SENTIMENT: {
    key: "UMICH_SENTIMENT",
    canonicalName: "UMich consumer sentiment (index)",
    eventType: "MACRO_DATA",
    transform: "level",
    unit: "index_points",
    unitLabel: "index",
    headlineNoun: "UMich Consumer Sentiment",
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
  // Final Demand is the headline PPI the market trades. PPIACO (all
  // commodities) is a different, far more volatile index: -0.8% vs the
  // 2.1% actually printed for Mar-2024.
  { seriesId: "PPIFIS", metric: METRICS.PPI_HEADLINE },
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
  Record<EventTypeLiteral, SeriesBinding>
> = {
  CPI: { seriesId: "CPIAUCNS", metric: METRICS.CPI_HEADLINE },
  PPI: { seriesId: "PPIFIS", metric: METRICS.PPI_HEADLINE },
  NFP: { seriesId: "PAYEMS", metric: METRICS.PAYROLLS },
  FED_DECISION: { seriesId: "DFEDTARU", metric: METRICS.FED_TARGET_UPPER },
};

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

/**
 * Convert the observation at `index` into its canonical headline value.
 *
 * Returns null when there is not enough history (e.g. a YoY calculation needs
 * 13 prior observations) or the source value is missing.
 */
export function deriveMetric(
  transform: MetricTransform,
  index: number,
  obs: readonly Observation[],
): DerivedMetric | null {
  const here = obs[index]?.value ?? null;
  if (here === null) return null;

  switch (transform) {
    case "yoy_pct": {
      const yearAgo = index - 12;
      if (yearAgo < 0) return null;
      const ya = obs[yearAgo].value;
      if (ya === null || ya === 0) return null;
      const yoy = ((here - ya) / ya) * 100;

      let prior: number | null = null;
      const pi = index - 1;
      const pya = index - 13;
      if (pi >= 0 && pya >= 0) {
        const a = obs[pi].value;
        const b = obs[pya].value;
        if (a !== null && b !== null && b !== 0) prior = ((a - b) / b) * 100;
      }
      return { value: round1(yoy), prior: prior === null ? null : round1(prior) };
    }

    case "qoq_pct_annualized": {
      if (index < 1) return null;
      const last = obs[index - 1].value;
      if (last === null || last === 0) return null;
      const ann = (Math.pow(here / last, 4) - 1) * 100;

      let prior: number | null = null;
      if (index >= 2) {
        const beforeLast = obs[index - 2].value;
        if (beforeLast !== null && beforeLast !== 0) {
          prior = (Math.pow(last / beforeLast, 4) - 1) * 100;
        }
      }
      return { value: round1(ann), prior: prior === null ? null : round1(prior) };
    }

    case "mom_diff_thousands": {
      if (index < 1) return null;
      const last = obs[index - 1].value;
      if (last === null) return null;

      let prior: number | null = null;
      if (index >= 2) {
        const beforeLast = obs[index - 2].value;
        if (beforeLast !== null) prior = Math.round(last - beforeLast);
      }
      return { value: Math.round(here - last), prior };
    }

    case "level_pct":
    case "level": {
      const p = index >= 1 ? obs[index - 1].value : null;
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

export function directionVsPrior(
  current: number,
  prior: number | null,
  tolerance: number,
): "above" | "below" | "in line with" {
  if (prior === null) return "in line with";
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

/** Shared headline text so FRED and BLS prints of the same metric read alike. */
export function makeMetricHeadline(
  metric: CanonicalMetric,
  value: number,
  prior: number | null,
  iso: string,
): string {
  const dir = directionVsPrior(value, prior, headlineTolerance(metric.transform));
  switch (metric.transform) {
    case "yoy_pct":
      return `${metric.headlineNoun} prints ${value.toFixed(1)}% YoY — ${dir} prior (${formatMonth(iso)})`;
    case "qoq_pct_annualized":
      return `${metric.headlineNoun} ${value >= 0 ? "+" : ""}${value.toFixed(1)}% annualised — ${dir} prior (${quarterLabel(iso)})`;
    case "mom_diff_thousands": {
      const sign = value >= 0 ? "+" : "";
      const formatted = `${sign}${Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(0)}M` : `${value}k`}`;
      return `${metric.headlineNoun} ${formatted} — ${dir} prior (${formatMonth(iso)})`;
    }
    case "level_pct":
      return `${metric.headlineNoun} ${value.toFixed(2)}% — ${dir} prior (${formatMonth(iso)})`;
    case "level":
      return `${metric.headlineNoun} ${value.toFixed(1)} — ${dir} prior (${formatMonth(iso)})`;
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
