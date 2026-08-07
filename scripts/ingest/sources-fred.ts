/**
 * FRED source — yields one candidate Event per observation.
 *
 * FRED stores raw index levels (CPIAUCSL = 296.5, PAYEMS = 159000 thousand etc).
 * News headlines speak in derived metrics (CPI YoY %, NFP MoM change, etc).
 * The `display` field on each series declares how to transform the raw value
 * into a headline number.
 */

import type { CandidateEvent, EventTypeLiteral } from "./auto-ingest-types";

const FRED_BASE = "https://api.stlouisfed.org/fred";

type DisplayMode =
  | "yoy_pct" // monthly index → year-over-year % change
  | "qoq_pct_annualized" // quarterly index → QoQ% annualised
  | "mom_diff_thousands" // PAYEMS / JOLTS → MoM change in 000s
  | "level_pct" // already a percent (UNRATE, FEDFUNDS)
  | "level"; // already a meaningful number (UMCSENT)

interface FredSeries {
  id: string;
  display: DisplayMode;
  eventType: EventTypeLiteral;
  metricName: string;
  headlineNoun: string; // "CPI", "Nonfarm payrolls", etc — used in templates
}

const FRED_SERIES: ReadonlyArray<FredSeries> = [
  {
    id: "CPIAUCSL",
    display: "yoy_pct",
    eventType: "CPI",
    metricName: "CPI All Urban Consumers",
    headlineNoun: "CPI",
  },
  {
    id: "CPILFESL",
    display: "yoy_pct",
    eventType: "CPI",
    metricName: "Core CPI (ex Food & Energy)",
    headlineNoun: "Core CPI",
  },
  {
    id: "PPIACO",
    display: "yoy_pct",
    eventType: "PPI",
    metricName: "PPI All Commodities",
    headlineNoun: "PPI",
  },
  {
    id: "PAYEMS",
    display: "mom_diff_thousands",
    eventType: "NFP",
    metricName: "Nonfarm Payrolls",
    headlineNoun: "Nonfarm payrolls",
  },
  {
    id: "UNRATE",
    display: "level_pct",
    eventType: "NFP",
    metricName: "Unemployment Rate",
    headlineNoun: "Unemployment rate",
  },
  {
    id: "FEDFUNDS",
    display: "level_pct",
    eventType: "FED_DECISION",
    metricName: "Federal Funds Rate",
    headlineNoun: "Effective Fed funds rate",
  },
  {
    id: "PCE",
    display: "yoy_pct",
    eventType: "CPI",
    metricName: "Personal Consumption Expenditures",
    headlineNoun: "PCE",
  },
  {
    id: "PCEPILFE",
    display: "yoy_pct",
    eventType: "CPI",
    metricName: "Core PCE Price Index",
    headlineNoun: "Core PCE",
  },
  {
    id: "GDPC1",
    display: "qoq_pct_annualized",
    eventType: "MACRO_DATA",
    metricName: "Real GDP Growth Rate",
    headlineNoun: "Real GDP",
  },
  {
    id: "UMCSENT",
    display: "level",
    eventType: "MACRO_DATA",
    metricName: "UMich Consumer Sentiment",
    headlineNoun: "UMich Consumer Sentiment",
  },
  // NB: the spec wrote "JOLTS" but the real FRED ID is JTSJOL. Using the working one.
  {
    id: "JTSJOL",
    display: "mom_diff_thousands",
    eventType: "NFP",
    metricName: "JOLTS Job Openings",
    headlineNoun: "Job openings",
  },
];

interface FredObservation {
  date: string;
  value: string;
}

interface FredResponse {
  observations?: FredObservation[];
}

const toFloat = (v: string): number | null => {
  if (v === "" || v === ".") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function fetchObservations(
  seriesId: string,
  apiKey: string,
  since: string,
): Promise<FredObservation[]> {
  const url = new URL(`${FRED_BASE}/series/observations`);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("observation_start", since);
  url.searchParams.set("sort_order", "asc");
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`FRED ${seriesId}: HTTP ${res.status}`);
  }
  const json = (await res.json()) as FredResponse;
  return json.observations ?? [];
}

function formatMonth(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function quarterLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const m = d.getUTCMonth();
  return `Q${Math.floor(m / 3) + 1} ${d.getUTCFullYear()}`;
}

function directionVsPrior(
  current: number,
  prior: number | null,
  tolerance = 0.05,
): "above" | "below" | "in line with" {
  if (prior === null) return "in line with";
  const diff = current - prior;
  if (Math.abs(diff) <= tolerance) return "in line with";
  return diff > 0 ? "above" : "below";
}

/**
 * Compute the "headline number" for a given observation according to the
 * display mode. Returns null if the input is insufficient (e.g. needs
 * 12 months of history we don't have yet).
 */
function deriveHeadlineNumber(
  series: FredSeries,
  index: number,
  observations: FredObservation[],
): { value: number; prior: number | null } | null {
  const here = toFloat(observations[index].value);
  if (here === null) return null;

  switch (series.display) {
    case "yoy_pct": {
      const yearAgo = index - 12;
      if (yearAgo < 0) return null;
      const ya = toFloat(observations[yearAgo].value);
      if (ya === null || ya === 0) return null;
      const yoy = ((here - ya) / ya) * 100;
      const priorIndex = index - 1;
      const priorYearAgo = index - 13;
      let prior: number | null = null;
      if (priorIndex >= 0 && priorYearAgo >= 0) {
        const pi = toFloat(observations[priorIndex].value);
        const pya = toFloat(observations[priorYearAgo].value);
        if (pi !== null && pya !== null && pya !== 0) {
          prior = ((pi - pya) / pya) * 100;
        }
      }
      return { value: round1(yoy), prior: prior !== null ? round1(prior) : null };
    }
    case "qoq_pct_annualized": {
      if (index < 1) return null;
      const last = toFloat(observations[index - 1].value);
      if (last === null || last === 0) return null;
      // FRED GDPC1 is quarterly real GDP level; annualise the QoQ change.
      const ann = (Math.pow(here / last, 4) - 1) * 100;
      let prior: number | null = null;
      if (index >= 2) {
        const beforeLast = toFloat(observations[index - 2].value);
        if (beforeLast !== null && beforeLast !== 0) {
          prior = (Math.pow(last / beforeLast, 4) - 1) * 100;
        }
      }
      return { value: round1(ann), prior: prior !== null ? round1(prior) : null };
    }
    case "mom_diff_thousands": {
      if (index < 1) return null;
      const last = toFloat(observations[index - 1].value);
      if (last === null) return null;
      const mom = here - last;
      let prior: number | null = null;
      if (index >= 2) {
        const beforeLast = toFloat(observations[index - 2].value);
        if (beforeLast !== null) prior = last - beforeLast;
      }
      return { value: Math.round(mom), prior: prior !== null ? Math.round(prior) : null };
    }
    case "level_pct":
    case "level": {
      const prior =
        index >= 1 ? toFloat(observations[index - 1].value) : null;
      return { value: round2(here), prior: prior !== null ? round2(prior) : null };
    }
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

function makeHeadline(
  series: FredSeries,
  value: number,
  prior: number | null,
  iso: string,
): string {
  const dir = directionVsPrior(value, prior, headlineTolerance(series));
  switch (series.display) {
    case "yoy_pct":
      return `${series.headlineNoun} prints ${value.toFixed(1)}% YoY — ${dir} prior (${formatMonth(iso)})`;
    case "qoq_pct_annualized":
      return `${series.headlineNoun} ${value >= 0 ? "+" : ""}${value.toFixed(1)}% annualised — ${dir} prior (${quarterLabel(iso)})`;
    case "mom_diff_thousands": {
      const sign = value >= 0 ? "+" : "";
      const formatted = `${sign}${Math.abs(value) >= 1000 ? (value / 1000).toFixed(0) + "M" : value + "k"}`;
      return `${series.headlineNoun} ${formatted} — ${dir} prior (${formatMonth(iso)})`;
    }
    case "level_pct":
      return `${series.headlineNoun} ${value.toFixed(2)}% — ${dir} prior (${formatMonth(iso)})`;
    case "level":
      return `${series.headlineNoun} ${value.toFixed(1)} — ${dir} prior (${formatMonth(iso)})`;
  }
}

function headlineTolerance(series: FredSeries): number {
  switch (series.display) {
    case "yoy_pct":
    case "qoq_pct_annualized":
      return 0.05;
    case "mom_diff_thousands":
      return 5; // 5k threshold for "in line"
    case "level_pct":
      return 0.01;
    case "level":
      return 0.5;
  }
}

export interface FredSourceOptions {
  apiKey: string;
  since: string; // ISO date
  log: (msg: string) => void;
}

export async function* yieldFredEvents(
  opts: FredSourceOptions,
): AsyncGenerator<CandidateEvent> {
  for (const series of FRED_SERIES) {
    opts.log(`[FRED] Fetching ${series.id} (${series.metricName})…`);
    let observations: FredObservation[];
    try {
      observations = await fetchObservations(series.id, opts.apiKey, opts.since);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      opts.log(`[FRED] ⚠ ${series.id}: ${detail}`);
      continue;
    }
    opts.log(
      `[FRED]   ${observations.length} observation${observations.length === 1 ? "" : "s"} found`,
    );

    for (let i = 0; i < observations.length; i++) {
      const obs = observations[i];
      const derived = deriveHeadlineNumber(series, i, observations);
      if (!derived) continue;
      const { value, prior } = derived;
      const occurredAt = new Date(`${obs.date}T08:30:00-05:00`); // 8:30 ET
      if (Number.isNaN(occurredAt.getTime())) continue;
      const headline = makeHeadline(series, value, prior, obs.date);
      const rawActual = toFloat(obs.value);
      yield {
        headline,
        eventType: series.eventType,
        occurredAt,
        sourceUrl: `https://fred.stlouisfed.org/series/${series.id}`,
        source: "FRED",
        data: {
          metricName: series.metricName,
          actualValue: value,
          priorValue: prior,
          expectedValue: null,
          // Per spec: FRED has no consensus, use prior as proxy. The DataRelease
          // row records the headline-number-vs-prior delta.
          surpriseMagnitude:
            prior !== null
              ? Math.round((value - prior) * 1e4) / 1e4
              : null,
          rawActual,
        },
      };
    }
  }
}