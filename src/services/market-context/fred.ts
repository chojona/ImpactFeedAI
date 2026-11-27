/**
 * Read-only FRED series/observations adapter for market-context series.
 *
 * Used as primary source for breakevens (T5YIE/T10YIE) and Fed target bounds
 * (DFEDTARU/DFEDTARL), and as an optional mirror for VIXCLS / DGS*.
 *
 * Current-revised pulls (default observations endpoint without a realtime
 * vintage) are marked `revised_latest` and are **not** eligible for historical
 * public-information reconstruction. Pass `vintageAsOf` (ALFRED-style
 * realtime_start=realtime_end) to request a point-in-time panel.
 *
 * Does not write to any database. Callers must respect FRED API Terms.
 */

import type { KnowledgeMode, MarketContextObservation } from "@/types/context";
import {
  fredRevisedLatestAvailability,
  fredVintageAvailability,
  observationAtFromIsoDate,
  parseIsoDateOnly,
  parseRawNumeric,
  qualityForParsedValue,
} from "@/services/market-context/availability";
import { historicalReconstructionStatusForQuality } from "@/services/market-context/eligibility";
import { fetchText } from "@/services/market-context/http";
import {
  MARKET_SERIES_KEYS,
  marketSeriesByCatalogId,
  type SeriesCatalogId,
} from "@/services/market-context/series";
import type {
  FetchLike,
  MarketContextFetchError,
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
  /**
   * ALFRED-style as-of day (`YYYY-MM-DD`). Sets realtime_start=realtime_end so
   * the panel is the series as known on that day. Required for historical
   * reconstruction eligibility.
   */
  readonly vintageAsOf?: string;
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
  if (opts.vintageAsOf) {
    url.searchParams.set("realtime_start", opts.vintageAsOf);
    url.searchParams.set("realtime_end", opts.vintageAsOf);
  }
  return url.toString();
}

const REDACTED = "[REDACTED]";

/**
 * Credential-free endpoint for provenance and errors. Matches PR #20's
 * `redactFredUrl`: the `api_key` parameter is removed, not masked.
 */
export function redactFredApiKey(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    url.searchParams.delete("api_key");
    return url.toString();
  } catch {
    return endpoint
      .replace(/([?&])api_key=[^&#\s]*&?/gi, "$1")
      .replace(/[?&](#|$)/, "$1");
  }
}

/**
 * Scrub a FRED API key from free text (exception / response-reading messages),
 * following PR #20's standard: every occurrence becomes `[REDACTED]`. Also
 * catches the URL-encoded key and any `api_key=` value echoed by a transport.
 */
export function redactFredText(text: string, apiKey: string | undefined): string {
  let out = text;
  if (apiKey) {
    const variants = new Set([apiKey, encodeURIComponent(apiKey)]);
    for (const variant of variants) out = out.split(variant).join(REDACTED);
  }
  return out.replace(/(api_key=)[^&#\s"']+/gi, `$1${REDACTED}`);
}

/** Apply both redactions to an error object before it leaves the adapter. */
export function redactFredFetchError(
  error: MarketContextFetchError,
  apiKey: string | undefined,
): MarketContextFetchError {
  return {
    ...error,
    message: redactFredText(error.message, apiKey),
    sourceEndpoint: redactFredText(redactFredApiKey(error.sourceEndpoint), apiKey),
  };
}

function mapFredRows(
  seriesId: FredMarketSeriesId,
  rows: readonly FredObservationJson[],
  fetchedAt: Date,
  sourceEndpoint: string,
  requestId: string | null,
  etag: string | null,
  knowledgeMode: KnowledgeMode,
  vintageAsOf: string | null,
): RetrievedMarketObservation[] {
  const catalog = marketSeriesByCatalogId(FRED_TO_CATALOG[seriesId]);
  const out: RetrievedMarketObservation[] = [];
  const vintageMode = vintageAsOf !== null;

  for (const row of rows) {
    const isoDate = row.date?.trim() ?? "";
    const observationAt = observationAtFromIsoDate(isoDate);
    if (!observationAt) continue;

    const parsed = parseRawNumeric(row.value);
    const availability = vintageMode
      ? fredVintageAvailability(vintageAsOf)
      : fredRevisedLatestAvailability();

    const quality = qualityForParsedValue(parsed.value, availability.quality);
    const observation: MarketContextObservation = {
      id: vintageMode
        ? `fred:${seriesId}:${isoDate}:asof:${vintageAsOf}`
        : `fred:${seriesId}:${isoDate}:revised_latest`,
      seriesKey: catalog.seriesKey,
      value: parsed.value,
      unit: catalog.unit,
      observationAt,
      observationDate: isoDate,
      availableAt: parsed.value === null ? null : availability.availableAt,
      fetchedAt,
      publishedAt: null,
      sourceAt: null,
      quality,
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
        availabilityPrecision: availability.availabilityPrecision,
        availabilityPolicyVersion: availability.availabilityPolicyVersion,
        parseStatus: parsed.parseStatus,
        knowledgeMode,
        historicalReconstruction: historicalReconstructionStatusForQuality(quality),
        vintageAsOf,
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
  let result: MarketContextFetchResult;
  try {
    result = await fetchFredMarketObservationsUnredacted(opts);
  } catch (err) {
    // Never let an injected fetch / parser exception carry the key upward.
    // The original error is dropped (not attached as `cause`) on purpose.
    const raw = err instanceof Error ? err.message : String(err);
    throw new Error(redactFredText(raw, opts.apiKey));
  }
  if (result.ok) return result;
  return { ok: false, error: redactFredFetchError(result.error, opts.apiKey) };
}

async function fetchFredMarketObservationsUnredacted(
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

  if (opts.vintageAsOf && !parseIsoDateOnly(opts.vintageAsOf)) {
    return {
      ok: false,
      error: {
        kind: "config_error",
        message: `invalid vintageAsOf date: ${opts.vintageAsOf}`,
        sourceProvider: "fred",
        sourceEndpoint: FRED_OBSERVATIONS_URL,
        statusCode: null,
      },
    };
  }

  const fetchedAt = opts.fetchedAt ?? new Date();
  const knowledgeMode =
    opts.knowledgeMode ?? "PUBLIC_INFORMATION_RECONSTRUCTION";
  const vintageAsOf = opts.vintageAsOf ?? null;
  const endpoint = opts.fixtureBody
    ? `fixture:fred:${opts.seriesId}${vintageAsOf ? `:asof:${vintageAsOf}` : ":revised_latest"}`
    : redactFredApiKey(buildFredUrl(opts));

  let body: string;
  let requestId: string | null = null;
  let etag: string | null = null;

  if (opts.fixtureBody !== undefined) {
    body = opts.fixtureBody;
  } else {
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    const response = await fetchText(fetchImpl, buildFredUrl(opts), "fred");
    if (!response.ok) {
      return { ok: false, error: response.error };
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
    vintageAsOf,
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
