/**
 * Read-only FRED series/observations adapter for market-context series.
 *
 * Used as primary source for breakevens (T5YIE/T10YIE) and Fed target bounds
 * (DFEDTARU/DFEDTARL), and as an optional mirror for VIXCLS / DGS*.
 *
 * Does not write to any database. Callers must respect FRED API Terms —
 * especially restrictions on storing/caching/archiving FRED Content.
 */

import type { KnowledgeMode, MarketContextObservation } from "@/types/context";
import {
  DATE_AVAILABILITY_PRECISION,
  conservativeAvailableAtFromIsoDate,
  observationAtFromIsoDate,
  parseRawNumeric,
  qualityForParsedValue,
} from "@/services/market-context/availability";
import { fetchText } from "@/services/market-context/http";
import {
  MARKET_SERIES_KEYS,
  marketSeriesByCatalogId,
  type SeriesCatalogId,
} from "@/services/market-context/series";
import type {
  FetchLike,
  MarketContextFetchResult,
  RetrievedMarketObservation,
} from "@/services/market-context/types";

const FRED_OBSERVATIONS_URL =
  "https://api.stlouisfed.org/fred/series/observations";

export const FRED_MARKET_SERIES_IDS = {
  VIXCLS: "VIXCLS",
  DGS2: "DGS2",
  DGS10: "DGS10",
  DGS3MO: "DGS3MO",
  T5YIE: "T5YIE",
  T10YIE: "T10YIE",
  DFEDTARU: "DFEDTARU",
  DFEDTARL: "DFEDTARL",
} as const;

export type FredMarketSeriesId =
  (typeof FRED_MARKET_SERIES_IDS)[keyof typeof FRED_MARKET_SERIES_IDS];

const FRED_TO_CATALOG: Record<FredMarketSeriesId, SeriesCatalogId> = {
  VIXCLS: "VIXCLS",
  DGS2: "DGS2",
  DGS10: "DGS10",
  DGS3MO: "DGS3MO",
  T5YIE: "T5YIE",
  T10YIE: "T10YIE",
  DFEDTARU: "DFEDTARU",
  DFEDTARL: "DFEDTARL",
};

interface FredObservationJson {
  date?: string;
  value?: string;
  realtime_start?: string;
  realtime_end?: string;
}

interface FredObservationsResponse {
  observations?: FredObservationJson[];
}

export interface FredMarketFetchOptions {
  readonly apiKey: string;
  readonly seriesId: FredMarketSeriesId;
  readonly observationStart?: string;
  readonly observationEnd?: string;
  readonly fetchImpl?: FetchLike;
  readonly fetchedAt?: Date;
  readonly knowledgeMode?: KnowledgeMode;
  /** Optional: parse a preloaded JSON body (network-free tests). */
  readonly fixtureBody?: string;
}

function buildFredUrl(opts: FredMarketFetchOptions): string {
  const url = new URL(FRED_OBSERVATIONS_URL);
  url.searchParams.set("series_id", opts.seriesId);
  url.searchParams.set("api_key", opts.apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "asc");
  if (opts.observationStart) {
    url.searchParams.set("observation_start", opts.observationStart);
  }
  if (opts.observationEnd) {
    url.searchParams.set("observation_end", opts.observationEnd);
  }
  return url.toString();
}

/** Redact API key from URLs stored in provenance. */
export function redactFredApiKey(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    if (url.searchParams.has("api_key")) {
      url.searchParams.set("api_key", "REDACTED");
    }
    return url.toString();
  } catch {
    return endpoint.replace(/api_key=[^&]+/i, "api_key=REDACTED");
  }
}

function mapFredRows(
  seriesId: FredMarketSeriesId,
  rows: readonly FredObservationJson[],
  fetchedAt: Date,
  sourceEndpoint: string,
  requestId: string | null,
  etag: string | null,
  knowledgeMode: KnowledgeMode,
): RetrievedMarketObservation[] {
  const catalog = marketSeriesByCatalogId(FRED_TO_CATALOG[seriesId]);
  const out: RetrievedMarketObservation[] = [];

  for (const row of rows) {
    const isoDate = row.date?.trim() ?? "";
    const observationAt = observationAtFromIsoDate(isoDate);
    if (!observationAt) continue;

    const parsed = parseRawNumeric(row.value);
    const availableAt = conservativeAvailableAtFromIsoDate(isoDate);
    const observation: MarketContextObservation = {
      id: `fred:${seriesId}:${isoDate}`,
      seriesKey: catalog.seriesKey,
      value: parsed.value,
      unit: catalog.unit,
      observationAt,
      observationDate: isoDate,
      availableAt,
      publishedAt: null,
      sourceAt: null,
      quality: qualityForParsedValue(parsed.value),
    };

    out.push({
      observation,
      retrieval: {
        fetchedAt,
        sourceProvider: "fred",
        sourceEndpoint,
        requestId,
        etag,
        rawValue: parsed.rawValue,
        availabilityPrecision: DATE_AVAILABILITY_PRECISION,
        parseStatus: parsed.parseStatus,
        knowledgeMode,
      },
    });
  }

  return out;
}

/**
 * Fetch (or parse) FRED observations for one market-context series.
 * Pure over the response body once retrieved; no DB access.
 */
export async function fetchFredMarketObservations(
  opts: FredMarketFetchOptions,
): Promise<MarketContextFetchResult> {
  if (!opts.apiKey && !opts.fixtureBody) {
    return {
      ok: false,
      error: {
        kind: "config_error",
        message: "FRED_API_KEY is required when fixtureBody is not provided",
        sourceProvider: "fred",
        sourceEndpoint: FRED_OBSERVATIONS_URL,
        statusCode: null,
      },
    };
  }

  const fetchedAt = opts.fetchedAt ?? new Date();
  const knowledgeMode =
    opts.knowledgeMode ?? "PUBLIC_INFORMATION_RECONSTRUCTION";
  const endpoint = opts.fixtureBody
    ? `fixture:fred:${opts.seriesId}`
    : redactFredApiKey(buildFredUrl(opts));

  let body: string;
  let requestId: string | null = null;
  let etag: string | null = null;

  if (opts.fixtureBody !== undefined) {
    body = opts.fixtureBody;
  } else {
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    const response = await fetchText(
      fetchImpl,
      buildFredUrl(opts),
      "fred",
    );
    if (!response.ok) {
      return {
        ok: false,
        error: {
          ...response.error,
          sourceEndpoint: redactFredApiKey(response.error.sourceEndpoint),
        },
      };
    }
    body = response.body;
    requestId = response.requestId;
    etag = response.etag;
  }

  let json: FredObservationsResponse;
  try {
    json = JSON.parse(body) as FredObservationsResponse;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: {
        kind: "parse_error",
        message: `invalid FRED JSON: ${detail}`,
        sourceProvider: "fred",
        sourceEndpoint: endpoint,
        statusCode: null,
      },
    };
  }

  const observations = mapFredRows(
    opts.seriesId,
    json.observations ?? [],
    fetchedAt,
    endpoint,
    requestId,
    etag,
    knowledgeMode,
  );

  return {
    ok: true,
    observations,
    retrievalBatch: {
      fetchedAt,
      sourceProvider: "fred",
      sourceEndpoint: endpoint,
      requestId,
      etag,
    },
  };
}

export function isFredMarketSeriesId(value: string): value is FredMarketSeriesId {
  return Object.values(FRED_MARKET_SERIES_IDS).includes(
    value as FredMarketSeriesId,
  );
}

/** Series keys this adapter can emit (aligned with Agent 06 where overlapping). */
export const FRED_EMITTED_SERIES_KEYS = [
  MARKET_SERIES_KEYS.VIXCLS,
  MARKET_SERIES_KEYS.DGS2,
  MARKET_SERIES_KEYS.DGS10,
  MARKET_SERIES_KEYS.DGS3MO,
  MARKET_SERIES_KEYS.T5YIE,
  MARKET_SERIES_KEYS.T10YIE,
  MARKET_SERIES_KEYS.DFEDTARU,
  MARKET_SERIES_KEYS.DFEDTARL,
] as const;
