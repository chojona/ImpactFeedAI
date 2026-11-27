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
import {
  isValidEvidenceReference,
  type ActualValueKind,
  type EvidenceReference,
} from "@/services/macro/actualProvenance";
import { utcDateOnly } from "@/services/macro/time";
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
  readonly value: string | null;
  readonly realtime_start: string;
  readonly realtime_end: string;
}

export interface AlfredObservationsResponse {
  readonly observations?: AlfredRawObservation[];
  readonly realtime_start?: string;
  readonly realtime_end?: string;
  readonly output_type?: number;
  readonly count?: number;
  readonly offset?: number;
  readonly error_code?: number;
  readonly error_message?: string;
}

/** Independently reviewed publication of this exact series, period and value. */
export interface AlfredPublicationEvidence {
  readonly seriesId: string;
  readonly observationPeriodStart: string;
  readonly publicationDate: string;
  readonly value: number;
  readonly releaseStage: "INITIAL" | "REVISION";
  readonly reference: Readonly<EvidenceReference>;
}

export interface AlfredObservation extends ContextObservation {
  /** Date of the provider's single-day information set, not a publication date. */
  readonly snapshotAsOf: string | null;
  readonly publicationEvidence: AlfredPublicationEvidence | null;
}

export interface AlfredFetchResult {
  readonly status: "ok" | "missing" | "error";
  readonly mode: AlfredFetchMode;
  readonly seriesId: string;
  readonly requestUrlRedacted: string;
  readonly observations: readonly AlfredObservation[];
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

function parseFloatOrNull(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value === "" || value === ".") return null;
  const n = Number(value);
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

function valueKindFor(
  mode: AlfredFetchMode,
  releaseStage: ContextReleaseStage,
): ActualValueKind {
  if (mode === "current_latest") return "CURRENT_DATABASE";
  if (releaseStage === "INITIAL") return "INITIAL_REPORTED";
  if (releaseStage === "REVISION") return "REVISED_HISTORICAL";
  return "UNRESOLVED";
}

/**
 * A complete provider revision history establishes the first published value
 * for each period. Missing markers do not count as releases.
 */
function firstArchivedVintageByPeriod(
  rows: readonly AlfredRawObservation[],
): ReadonlyMap<string, string> {
  const firstStartByPeriod = new Map<string, string>();
  for (const row of rows) {
    if (parseFloatOrNull(row.value) === null) continue;
    const existing = firstStartByPeriod.get(row.date);
    if (!existing || row.realtime_start < existing) {
      firstStartByPeriod.set(row.date, row.realtime_start);
    }
  }
  return firstStartByPeriod;
}

function mapAlfredObservation(input: {
  row: AlfredRawObservation;
  seriesId: string;
  seriesKey: string;
  unit: string;
  mode: AlfredFetchMode;
  value: number | null;
  releaseStage: ContextReleaseStage;
  publicationEvidence: AlfredPublicationEvidence | null;
  snapshotAsOf: string | null;
  fetchedAt: Date;
  recordedAt: Date;
  sourceUrlRedacted: string;
  payloadHash: string;
}): AlfredObservation {
  const { row, mode, value, publicationEvidence, snapshotAsOf } = input;
  const publicationDate = publicationEvidence?.publicationDate ?? null;
  const bound = alfredDateBoundAvailability(publicationDate ?? "");
  const quality: ObservationQuality = value === null
    ? "missing"
    : mode === "current_latest"
      ? "revised_latest"
      : bound.availableAt ? "conservative_date_bound" : "unknown_availability";
  const dateIdentity = mode === "as_of_vintage" || mode === "current_latest"
    ? `${mode}:${row.realtime_start}`
    : row.realtime_start;
  const vintageKey = `${input.seriesId}:${row.date}:${dateIdentity}`;

  return {
    id: `${FRED_ALFRED_PROVIDER_ID}:${vintageKey}`,
    seriesKey: input.seriesKey,
    providerSeriesId: input.seriesId,
    observationPeriodStart: row.date,
    value,
    rawValue: value === null ? null : row.value,
    unit: input.unit,
    vintageKey,
    realtimeStart: row.realtime_start,
    realtimeEnd: normalizeRealtimeEnd(row.realtime_end),
    vintageDate: row.realtime_start,
    snapshotAsOf,
    publicationEvidence,
    releaseStage: input.releaseStage,
    valueKind: valueKindFor(mode, input.releaseStage),
    publishedAt: bound.publishedAt,
    publicationDate,
    publicationPrecision: bound.publicationPrecision,
    availableAt: bound.availableAt,
    availabilityQuality: bound.availabilityQuality,
    availabilityPolicyVersion: bound.availabilityPolicyVersion,
    quality,
    fetchedAt: input.fetchedAt,
    recordedAt: input.recordedAt,
    sourceUrl: input.sourceUrlRedacted,
    payloadHash: input.payloadHash,
    ingestionVersion: CONTEXT_INGESTION_VERSION,
  };
}

function hasCompleteRevisionHistory(json: AlfredObservationsResponse, rowCount: number): boolean {
  return json.output_type === 1 &&
    json.realtime_start === ALFRED_FULL_REALTIME_START &&
    json.realtime_end === ALFRED_FULL_REALTIME_END &&
    json.offset === 0 && json.count === rowCount;
}

function snapshotDateFor(
  row: AlfredRawObservation,
  expectedDates: readonly (string | undefined)[],
): string | null {
  return row.realtime_start === row.realtime_end &&
    expectedDates.every((date) => date === undefined || date === row.realtime_start) &&
    Number.isFinite(utcDateOnly(row.realtime_start).getTime())
    ? row.realtime_start
    : null;
}

export function parseAlfredObservationsPayload(
  payload: string,
  meta: {
    seriesId: string;
    mode: AlfredFetchMode;
    fetchedAt: Date;
    recordedAt?: Date;
    sourceUrlRedacted: string;
    vintageDate?: string;
    publicationEvidence?: readonly AlfredPublicationEvidence[];
    seriesKey?: string;
    unit?: string;
  },
): AlfredObservation[] {
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
  const snapshotDates = [meta.vintageDate, json.realtime_start, json.realtime_end];
  const firstArchivedVintage =
    meta.mode === "revision_history" && hasCompleteRevisionHistory(json, rows.length)
      ? firstArchivedVintageByPeriod(rows)
      : null;
  const isInitialReleaseResponse =
    meta.mode === "initial_release_only" &&
    (json.output_type === undefined || json.output_type === 4) &&
    (json.realtime_start === undefined || json.realtime_start === ALFRED_FULL_REALTIME_START) &&
    (json.realtime_end === undefined || json.realtime_end === ALFRED_FULL_REALTIME_END);

  return rows.map((row) => {
    const value = parseFloatOrNull(row.value);
    const snapshotAsOf = meta.mode === "as_of_vintage" || meta.mode === "current_latest"
      ? snapshotDateFor(row, snapshotDates)
      : null;
    let providerStage: ContextReleaseStage = "UNKNOWN";
    if (value !== null && (isInitialReleaseResponse || firstArchivedVintage)) {
      providerStage = isInitialReleaseResponse || firstArchivedVintage?.get(row.date) === row.realtime_start
        ? "INITIAL"
        : "REVISION";
    }
    const matchingEvidence = meta.mode === "current_latest" ||
      (meta.mode === "as_of_vintage" && snapshotAsOf === null)
      ? []
      : meta.publicationEvidence?.filter((evidence) =>
          evidence.seriesId === meta.seriesId &&
          evidence.observationPeriodStart === row.date &&
          evidence.publicationDate === row.realtime_start &&
          evidence.value === value &&
          isValidEvidenceReference(evidence.reference)) ?? [];
    const evidence = matchingEvidence[0];
    const publicationEvidence = evidence &&
      matchingEvidence.every((match) => match.releaseStage === evidence.releaseStage) &&
      (providerStage === "UNKNOWN" || providerStage === evidence.releaseStage) &&
      Number.isFinite(utcDateOnly(evidence.publicationDate).getTime())
      ? evidence
      : null;
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
      value,
      releaseStage: publicationEvidence?.releaseStage ?? providerStage,
      publicationEvidence,
      snapshotAsOf,
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
  publicationEvidence?: readonly AlfredPublicationEvidence[];
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
      vintageDate: options.request.mode === "as_of_vintage" ? options.request.vintageDate : undefined,
      publicationEvidence: options.publicationEvidence,
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
    // An injected httpGet (or a wrapped fetch error) may echo the request URL;
    // never let the API key reach a returned or printed result.
    const raw = err instanceof Error ? err.message : String(err);
    const detail = options.apiKey ? raw.split(options.apiKey).join("[REDACTED]") : raw;
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
