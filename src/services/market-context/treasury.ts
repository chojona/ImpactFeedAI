/**
 * Read-only US Treasury Daily Par Yield Curve XML adapter.
 *
 * Endpoint pattern:
 * https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml
 *   ?data=daily_treasury_yield_curve
 *   &field_tdr_date_value=YYYY
 *   (or field_tdr_date_value=all&page=N, or field_tdr_date_value_month=YYYYMM)
 *
 * Fields used: NEW_DATE, BC_3MONTH, BC_2YEAR, BC_10YEAR
 * Emits Agent-06-compatible series keys for DGS2 / DGS10 plus DGS3MO.
 */

import type { KnowledgeMode, MarketContextObservation } from "@/types/context";
import {
  observationAtFromIsoDate,
  parseRawNumeric,
  qualityForParsedValue,
  treasuryDateTimeToIsoDate,
  treasuryH15Availability,
} from "@/services/market-context/availability";
import { historicalReconstructionStatusForQuality } from "@/services/market-context/eligibility";
import { fetchText } from "@/services/market-context/http";
import {
  MARKET_SERIES_KEYS,
  type CanonicalMarketSeriesKey,
} from "@/services/market-context/series";
import type {
  FetchLike,
  MarketContextFetchResult,
  RetrievedMarketObservation,
} from "@/services/market-context/types";

export const TREASURY_YIELD_XML_BASE =
  "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml";

export const TREASURY_YIELD_FIELDS = {
  BC_3MONTH: {
    xmlTag: "BC_3MONTH",
    seriesKey: MARKET_SERIES_KEYS.DGS3MO,
  },
  BC_2YEAR: {
    xmlTag: "BC_2YEAR",
    seriesKey: MARKET_SERIES_KEYS.DGS2,
  },
  BC_10YEAR: {
    xmlTag: "BC_10YEAR",
    seriesKey: MARKET_SERIES_KEYS.DGS10,
  },
} as const;

export type TreasuryYieldField = keyof typeof TREASURY_YIELD_FIELDS;

export interface TreasuryYieldFetchOptions {
  readonly fetchImpl?: FetchLike;
  readonly fetchedAt?: Date;
  readonly knowledgeMode?: KnowledgeMode;
  readonly fixtureBody?: string;
  /** Calendar year, e.g. 2024. Ignored when fixtureBody is set. */
  readonly year?: number;
  /** Month as YYYYMM. Takes precedence over year when set. */
  readonly yearMonth?: string;
  /** When true, use field_tdr_date_value=all&page=page. */
  readonly allPages?: boolean;
  readonly page?: number;
  readonly fields?: readonly TreasuryYieldField[];
}

export function buildTreasuryYieldUrl(opts: {
  year?: number;
  yearMonth?: string;
  allPages?: boolean;
  page?: number;
}): string {
  const url = new URL(TREASURY_YIELD_XML_BASE);
  url.searchParams.set("data", "daily_treasury_yield_curve");
  if (opts.yearMonth) {
    url.searchParams.set("field_tdr_date_value_month", opts.yearMonth);
  } else if (opts.allPages) {
    url.searchParams.set("field_tdr_date_value", "all");
    url.searchParams.set("page", String(opts.page ?? 0));
  } else if (opts.year !== undefined) {
    url.searchParams.set("field_tdr_date_value", String(opts.year));
  } else {
    throw new Error(
      "Treasury yield fetch requires year, yearMonth, allPages, or fixtureBody",
    );
  }
  return url.toString();
}

function extractTaggedValue(block: string, localName: string): string | null {
  // Match Atom/OData tags with optional namespace prefixes: <d:BC_2YEAR>...</d:BC_2YEAR>
  const re = new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?${localName}>`,
    "i",
  );
  const match = re.exec(block);
  if (!match) return null;
  return match[1]!.trim();
}

function splitEntries(xml: string): string[] {
  const entries: string[] = [];
  const re = /<entry\b[\s\S]*?<\/entry>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    entries.push(match[0]);
  }
  return entries;
}

export function parseTreasuryYieldXml(
  body: string,
  fetchedAt: Date,
  sourceEndpoint: string,
  requestId: string | null,
  etag: string | null,
  knowledgeMode: KnowledgeMode,
  fields: readonly TreasuryYieldField[],
): RetrievedMarketObservation[] {
  const out: RetrievedMarketObservation[] = [];

  for (const entry of splitEntries(body)) {
    const newDateRaw = extractTaggedValue(entry, "NEW_DATE");
    if (!newDateRaw) continue;
    const isoDate = treasuryDateTimeToIsoDate(newDateRaw);
    if (!isoDate) continue;
    const observationAt = observationAtFromIsoDate(isoDate);
    if (!observationAt) continue;
    const availability = treasuryH15Availability(isoDate);

    for (const field of fields) {
      const def = TREASURY_YIELD_FIELDS[field];
      const raw = extractTaggedValue(entry, def.xmlTag);
      const parsed = parseRawNumeric(raw);
      const seriesKey: CanonicalMarketSeriesKey = def.seriesKey;
      const quality = qualityForParsedValue(parsed.value, availability.quality);
      const observation: MarketContextObservation = {
        id: `us_treasury:${def.xmlTag}:${isoDate}`,
        seriesKey,
        value: parsed.value,
        unit: "pct_level",
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
          sourceProvider: "us_treasury",
          sourceEndpoint,
          requestId,
          etag,
          rawValue: parsed.rawValue,
          availabilityPrecision: availability.availabilityPrecision,
          availabilityPolicyVersion: availability.availabilityPolicyVersion,
          parseStatus: parsed.parseStatus,
          knowledgeMode,
          historicalReconstruction: historicalReconstructionStatusForQuality(quality),
          vintageAsOf: null,
        },
      });
    }
  }

  return out;
}

export async function fetchTreasuryYieldCurve(
  opts: TreasuryYieldFetchOptions = {},
): Promise<MarketContextFetchResult> {
  const fetchedAt = opts.fetchedAt ?? new Date();
  const knowledgeMode =
    opts.knowledgeMode ?? "PUBLIC_INFORMATION_RECONSTRUCTION";
  const fields = opts.fields ?? (["BC_3MONTH", "BC_2YEAR", "BC_10YEAR"] as const);

  let endpoint: string;
  try {
    endpoint = opts.fixtureBody
      ? "fixture:us_treasury:daily_treasury_yield_curve"
      : buildTreasuryYieldUrl(opts);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: {
        kind: "config_error",
        message: detail,
        sourceProvider: "us_treasury",
        sourceEndpoint: TREASURY_YIELD_XML_BASE,
        statusCode: null,
      },
    };
  }

  let body: string;
  let requestId: string | null = null;
  let etag: string | null = null;

  if (opts.fixtureBody !== undefined) {
    body = opts.fixtureBody;
  } else {
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    const response = await fetchText(fetchImpl, endpoint, "us_treasury");
    if (!response.ok) return { ok: false, error: response.error };
    body = response.body;
    requestId = response.requestId;
    etag = response.etag;
  }

  try {
    const observations = parseTreasuryYieldXml(
      body,
      fetchedAt,
      endpoint,
      requestId,
      etag,
      knowledgeMode,
      fields,
    );
    return {
      ok: true,
      observations,
      retrievalBatch: {
        fetchedAt,
        sourceProvider: "us_treasury",
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
        sourceProvider: "us_treasury",
        sourceEndpoint: endpoint,
        statusCode: null,
      },
    };
  }
}
