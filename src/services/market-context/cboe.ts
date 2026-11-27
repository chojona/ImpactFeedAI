/**
 * Read-only Cboe VIX daily history CSV adapter.
 *
 * Endpoint: https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv
 * Columns: DATE (M/D/YYYY), OPEN, HIGH, LOW, CLOSE
 *
 * Emits seriesKey `market:VIXCLS:level` so Agent 06 feature math can consume
 * Cboe closes under the same contract as FRED VIXCLS mirrors.
 *
 * Pre-2003 rows are methodology backfills (not contemporaneous VXO). Callers
 * that need real-time 1990s prints should document that limitation.
 */

import type { KnowledgeMode, MarketContextObservation } from "@/types/context";
import {
  DATE_AVAILABILITY_PRECISION,
  conservativeAvailableAtFromIsoDate,
  mdyToIsoDate,
  observationAtFromIsoDate,
  parseRawNumeric,
  qualityForParsedValue,
} from "@/services/market-context/availability";
import { fetchText } from "@/services/market-context/http";
import { MARKET_SERIES_KEYS } from "@/services/market-context/series";
import type {
  FetchLike,
  MarketContextFetchResult,
  RetrievedMarketObservation,
} from "@/services/market-context/types";

export const CBOE_VIX_HISTORY_URL =
  "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv";

export interface CboeVixFetchOptions {
  readonly fetchImpl?: FetchLike;
  readonly fetchedAt?: Date;
  readonly knowledgeMode?: KnowledgeMode;
  /** Optional: parse a preloaded CSV body (network-free tests). */
  readonly fixtureBody?: string;
  readonly observationStart?: string;
  readonly observationEnd?: string;
}

function parseCsvLine(line: string): string[] {
  // Cboe history is simple comma-separated with no quoted commas.
  return line.split(",").map((cell) => cell.trim());
}

function inRange(
  isoDate: string,
  start: string | undefined,
  end: string | undefined,
): boolean {
  if (start && isoDate < start) return false;
  if (end && isoDate > end) return false;
  return true;
}

export function parseCboeVixCsv(
  body: string,
  fetchedAt: Date,
  sourceEndpoint: string,
  requestId: string | null,
  etag: string | null,
  knowledgeMode: KnowledgeMode,
  observationStart?: string,
  observationEnd?: string,
): RetrievedMarketObservation[] {
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return [];

  const header = parseCsvLine(lines[0]!).map((h) => h.toUpperCase());
  const dateIdx = header.indexOf("DATE");
  const closeIdx = header.indexOf("CLOSE");
  if (dateIdx < 0 || closeIdx < 0) {
    throw new Error("Cboe VIX CSV missing DATE or CLOSE columns");
  }

  const out: RetrievedMarketObservation[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]!);
    const mdy = cells[dateIdx] ?? "";
    const isoDate = mdyToIsoDate(mdy);
    if (!isoDate) continue;
    if (!inRange(isoDate, observationStart, observationEnd)) continue;

    const observationAt = observationAtFromIsoDate(isoDate);
    if (!observationAt) continue;

    const parsed = parseRawNumeric(cells[closeIdx]);
    const availableAt = conservativeAvailableAtFromIsoDate(isoDate);
    const observation: MarketContextObservation = {
      id: `cboe:VIX:${isoDate}`,
      seriesKey: MARKET_SERIES_KEYS.VIXCLS,
      value: parsed.value,
      unit: "index_points",
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
        sourceProvider: "cboe",
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

export async function fetchCboeVixHistory(
  opts: CboeVixFetchOptions = {},
): Promise<MarketContextFetchResult> {
  const fetchedAt = opts.fetchedAt ?? new Date();
  const knowledgeMode =
    opts.knowledgeMode ?? "PUBLIC_INFORMATION_RECONSTRUCTION";
  const endpoint = opts.fixtureBody
    ? "fixture:cboe:VIX_History.csv"
    : CBOE_VIX_HISTORY_URL;

  let body: string;
  let requestId: string | null = null;
  let etag: string | null = null;

  if (opts.fixtureBody !== undefined) {
    body = opts.fixtureBody;
  } else {
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    const response = await fetchText(fetchImpl, CBOE_VIX_HISTORY_URL, "cboe");
    if (!response.ok) return { ok: false, error: response.error };
    body = response.body;
    requestId = response.requestId;
    etag = response.etag;
  }

  try {
    const observations = parseCboeVixCsv(
      body,
      fetchedAt,
      endpoint,
      requestId,
      etag,
      knowledgeMode,
      opts.observationStart,
      opts.observationEnd,
    );
    return {
      ok: true,
      observations,
      retrievalBatch: {
        fetchedAt,
        sourceProvider: "cboe",
        sourceEndpoint: endpoint,
        requestId,
        etag,
      },
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: {
        kind: "parse_error",
        message: detail,
        sourceProvider: "cboe",
        sourceEndpoint: endpoint,
        statusCode: null,
      },
    };
  }
}
