/**
 * ALFRED / FRED observations adapter for Phase 1.1.
 *
 * Builds requests, parses revision identity, and maps rows to ContextObservation.
 * Network I/O is injected. Empty vintage responses stay missing — there is no
 * silent fallback to current revised values.
 */

import { createHash } from "node:crypto";

import { alfredDateBoundAvailability } from "@/services/context/availability";
import {
  ALFRED_FULL_REALTIME_END,
  ALFRED_FULL_REALTIME_START,
  CONTEXT_INGESTION_VERSION,
  CONTEXT_SERIES,
  FRED_ALFRED_PROVIDER_ID,
  FRED_OBSERVATIONS_ENDPOINT,
  FRED_VINTAGE_DATES_ENDPOINT,
  type ContextSeriesDefinition,
} from "@/services/context/definitions";
import type { ActualValueKind } from "@/services/macro/actualProvenance";
import type {
  ContextObservation,
  ContextReleaseStage,
  ObservationQuality,
} from "@/types/context";

export type AlfredFetchMode =
  | "revision_history"
  | "initial_release_only"
  | "as_of_vintage"
  | "current_latest";

export interface AlfredObservationsRequest {
  readonly seriesId: string;
  readonly observationStart: string;
  readonly observationEnd: string;
  readonly mode: AlfredFetchMode;
  /** Required for as_of_vintage; ignored otherwise. */
  readonly vintageDate?: string;
}

export interface AlfredRawObservation {
  readonly date: string;
  readonly value: string;
  readonly realtime_start: string;
  readonly realtime_end: string;
}

export interface AlfredObservationsResponse {
  readonly observations?: AlfredRawObservation[];
  readonly error_code?: number;
  readonly error_message?: string;
}

export interface AlfredFetchResult {
  readonly status: "ok" | "missing" | "error";
  readonly mode: AlfredFetchMode;
  readonly seriesId: string;
  readonly requestUrlRedacted: string;
  readonly observations: readonly ContextObservation[];
  readonly fetchedAt: Date;
  readonly detail?: string;
}

export type AlfredHttpGet = (url: string) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

const OPEN_ENDED_REALTIME_END = "9999-12-31";

export function redactFredUrl(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.delete("api_key");
  return parsed.toString();
}

export function buildAlfredObservationsUrl(
  request: AlfredObservationsRequest,
  apiKey: string,
): string {
  const url = new URL(FRED_OBSERVATIONS_ENDPOINT);
  url.searchParams.set("series_id", request.seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("observation_start", request.observationStart);
  url.searchParams.set("observation_end", request.observationEnd);
  url.searchParams.set("sort_order", "asc");

  switch (request.mode) {
    case "revision_history":
      url.searchParams.set("realtime_start", ALFRED_FULL_REALTIME_START);
      url.searchParams.set("realtime_end", ALFRED_FULL_REALTIME_END);
      url.searchParams.set("output_type", "1");
      break;
    case "initial_release_only":
      url.searchParams.set("realtime_start", ALFRED_FULL_REALTIME_START);
      url.searchParams.set("realtime_end", ALFRED_FULL_REALTIME_END);
      url.searchParams.set("output_type", "4");
      break;
    case "as_of_vintage": {
      if (!request.vintageDate) {
        throw new TypeError("as_of_vintage requires vintageDate");
      }
      url.searchParams.set("realtime_start", request.vintageDate);
      url.searchParams.set("realtime_end", request.vintageDate);
      break;
    }
    case "current_latest":
      // Default FRED realtime = today. Explicit mode only — never a fallback.
      break;
  }

  return url.toString();
}

export function buildAlfredVintageDatesUrl(
  seriesId: string,
  apiKey: string,
  realtimeStart = ALFRED_FULL_REALTIME_START,
  realtimeEnd = ALFRED_FULL_REALTIME_END,
): string {
  const url = new URL(FRED_VINTAGE_DATES_ENDPOINT);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("realtime_start", realtimeStart);
  url.searchParams.set("realtime_end", realtimeEnd);
  url.searchParams.set("sort_order", "asc");
  return url.toString();
}

function parseFloatOrNull(raw: string): number | null {
  if (raw === "" || raw === ".") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function normalizeRealtimeEnd(end: string): string | null {
  return end === OPEN_ENDED_REALTIME_END ? null : end;
}

function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

function seriesDefinitionFor(
  seriesId: string,
): ContextSeriesDefinition | null {
  const found = Object.values(CONTEXT_SERIES).find(
    (s) => s.providerSeriesId === seriesId,
  );
  return found ?? null;
}

function qualityForMode(mode: AlfredFetchMode): ObservationQuality {
  switch (mode) {
    case "revision_history":
    case "initial_release_only":
    case "as_of_vintage":
      return "conservative_date_bound";
    case "current_latest":
      return "revised_latest";
  }
}

function valueKindFor(
  mode: AlfredFetchMode,
  releaseStage: ContextReleaseStage,
): ActualValueKind {
  if (mode === "current_latest") return "CURRENT_DATABASE";
  if (mode === "initial_release_only" || releaseStage === "INITIAL") {
    return "INITIAL_REPORTED";
  }
  return "REVISED_HISTORICAL";
}

/**
 * Assign INITIAL to the earliest realtime_start for each period within a
 * revision_history batch; later intervals become REVISION. Does not invent
 * advance/second/third GDP stages without a separate stage map.
 */
export function assignReleaseStages(
  rows: readonly AlfredRawObservation[],
): ReadonlyMap<string, ContextReleaseStage> {
  const firstStartByPeriod = new Map<string, string>();
  for (const row of rows) {
    const existing = firstStartByPeriod.get(row.date);
    if (!existing || row.realtime_start < existing) {
      firstStartByPeriod.set(row.date, row.realtime_start);
    }
  }
  const stages = new Map<string, ContextReleaseStage>();
  for (const row of rows) {
    const key = `${row.date}|${row.realtime_start}`;
    const first = firstStartByPeriod.get(row.date);
    stages.set(key, first === row.realtime_start ? "INITIAL" : "REVISION");
  }
  return stages;
}

export function mapAlfredObservation(input: {
  row: AlfredRawObservation;
  seriesId: string;
  seriesKey: string;
  unit: string;
  mode: AlfredFetchMode;
  releaseStage: ContextReleaseStage;
  fetchedAt: Date;
  recordedAt: Date;
  sourceUrlRedacted: string;
  payloadHash: string;
}): ContextObservation {
  const { row, mode } = input;
  const publicationDate = row.realtime_start;
  const bound =
    mode === "current_latest"
      ? {
          availableAt: null as Date | null,
          availabilityQuality: "UNRESOLVED" as const,
          availabilityPolicyVersion: null as string | null,
          publishedAt: null as null,
          publicationPrecision: "unknown" as const,
        }
      : alfredDateBoundAvailability(publicationDate);

  const quality = qualityForMode(mode);
  const value = parseFloatOrNull(row.value);

  return {
    id: `${FRED_ALFRED_PROVIDER_ID}:${input.seriesId}:${row.date}:${row.realtime_start}`,
    seriesKey: input.seriesKey,
    providerSeriesId: input.seriesId,
    observationPeriodStart: row.date,
    value,
    rawValue: row.value === "." ? null : row.value,
    unit: input.unit,
    vintageKey: `${input.seriesId}:${row.date}:${row.realtime_start}`,
    realtimeStart: row.realtime_start,
    realtimeEnd: normalizeRealtimeEnd(row.realtime_end),
    vintageDate: publicationDate,
    releaseStage: input.releaseStage,
    valueKind: valueKindFor(mode, input.releaseStage),
    publishedAt: bound.publishedAt,
    publicationDate,
    publicationPrecision: bound.publicationPrecision,
    availableAt: bound.availableAt,
    availabilityQuality: bound.availabilityQuality,
    availabilityPolicyVersion: bound.availabilityPolicyVersion,
    quality: value === null ? "missing" : quality,
    fetchedAt: input.fetchedAt,
    recordedAt: input.recordedAt,
    sourceUrl: input.sourceUrlRedacted,
    payloadHash: input.payloadHash,
    ingestionVersion: CONTEXT_INGESTION_VERSION,
  };
}

export function parseAlfredObservationsPayload(
  payload: string,
  meta: {
    seriesId: string;
    mode: AlfredFetchMode;
    fetchedAt: Date;
    recordedAt?: Date;
    sourceUrlRedacted: string;
    seriesKey?: string;
    unit?: string;
  },
): ContextObservation[] {
  const json = JSON.parse(payload) as AlfredObservationsResponse;
  if (json.error_code) {
    throw new Error(
      `ALFRED error ${json.error_code}: ${json.error_message ?? "unknown"}`,
    );
  }
  const rows = json.observations ?? [];
  const def = seriesDefinitionFor(meta.seriesId);
  const seriesKey =
    meta.seriesKey ?? def?.seriesKey ?? `fred:${meta.seriesId}`;
  const unit = meta.unit ?? def?.unit ?? "raw";
  const recordedAt = meta.recordedAt ?? meta.fetchedAt;
  const stages =
    meta.mode === "initial_release_only"
      ? null
      : assignReleaseStages(rows);

  return rows.map((row) => {
    const stageKey = `${row.date}|${row.realtime_start}`;
    const releaseStage: ContextReleaseStage =
      meta.mode === "initial_release_only"
        ? "INITIAL"
        : (stages?.get(stageKey) ?? "UNKNOWN");
    const canonicalRow = {
      date: row.date,
      value: row.value,
      realtime_start: row.realtime_start,
      realtime_end: row.realtime_end,
    };
    return mapAlfredObservation({
      row,
      seriesId: meta.seriesId,
      seriesKey,
      unit,
      mode: meta.mode,
      releaseStage,
      fetchedAt: meta.fetchedAt,
      recordedAt,
      sourceUrlRedacted: meta.sourceUrlRedacted,
      payloadHash: sha256Hex(JSON.stringify(canonicalRow)),
    });
  });
}

/**
 * Fetch ALFRED observations. Callers that want current values must use
 * mode `current_latest` explicitly; empty vintage results are `missing`.
 */
export async function fetchAlfredObservations(options: {
  request: AlfredObservationsRequest;
  apiKey: string;
  httpGet: AlfredHttpGet;
  now?: Date;
  seriesKey?: string;
  unit?: string;
}): Promise<AlfredFetchResult> {
  const fetchedAt = options.now ?? new Date();
  const url = buildAlfredObservationsUrl(options.request, options.apiKey);
  const redacted = redactFredUrl(url);

  try {
    const res = await options.httpGet(url);
    const text = await res.text();
    if (!res.ok) {
      return {
        status: "error",
        mode: options.request.mode,
        seriesId: options.request.seriesId,
        requestUrlRedacted: redacted,
        observations: [],
        fetchedAt,
        detail: `HTTP ${res.status}`,
      };
    }
    const observations = parseAlfredObservationsPayload(text, {
      seriesId: options.request.seriesId,
      mode: options.request.mode,
      fetchedAt,
      sourceUrlRedacted: redacted,
      seriesKey: options.seriesKey,
      unit: options.unit,
    });
    if (observations.length === 0) {
      return {
        status: "missing",
        mode: options.request.mode,
        seriesId: options.request.seriesId,
        requestUrlRedacted: redacted,
        observations: [],
        fetchedAt,
        detail: "empty_observation_set",
      };
    }
    return {
      status: "ok",
      mode: options.request.mode,
      seriesId: options.request.seriesId,
      requestUrlRedacted: redacted,
      observations,
      fetchedAt,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      status: "error",
      mode: options.request.mode,
      seriesId: options.request.seriesId,
      requestUrlRedacted: redacted,
      observations: [],
      fetchedAt,
      detail,
    };
  }
}

/**
 * Deliberate no-op guard: adapters must not chain as_of_vintage → current_latest.
 */
export function refuseSilentCurrentFallback(detail: string): never {
  throw new Error(
    `Refusing silent current-vintage fallback (${detail}). Use mode current_latest explicitly and mark revised_latest.`,
  );
}
