/**
 * Read-only parquet bar store over the local Databento NQ outright archive.
 *
 * Uses hyparquet + ZSTD compressors. Never writes. Only row groups whose
 * `timestamp_utc` statistics can overlap the window are decoded, so the full
 * 6.7M-row file is not materialised.
 *
 * Validation fails closed and happens before any filtering:
 * - `timestamp_utc` must be a UTC-adjusted parquet TIMESTAMP column, decoded
 *   at full nanosecond precision (a Date would hide sub-millisecond offsets);
 *   null timestamps or any other representation throw.
 * - every decoded row's timestamp is checked before window/contract filters,
 *   and an in-window row without a contract is rejected, not skipped.
 * - any in-window row that is malformed (misaligned or conflicting
 *   timestamps, no trading_date, broken OHLC, duplicate minute, …) makes the
 *   whole query throw rather than being dropped or repaired.
 */
import {
  asyncBufferFromFile,
  parquetMetadataAsync,
  parquetReadObjects,
  type FileMetaData,
  type ParquetParsers,
  type RowGroup,
} from "hyparquet";
import { compressors } from "hyparquet-compressors";

import { NqArchiveDataError } from "./errors";
import { isIsoDate } from "./isoDate";
import type { NqBarStore, NqMinuteBar } from "./types";

const COLUMNS = [
  "ts_event_ns",
  "timestamp_utc",
  "trading_date",
  "contract",
  "open",
  "high",
  "low",
  "close",
  "volume",
] as const;

const DAY_MS = 86_400_000;
const NS_PER_US = BigInt(1_000);
const NS_PER_MS = BigInt(1_000_000);
const NS_PER_MINUTE = BigInt(60_000) * NS_PER_MS;
const ZERO = BigInt(0);

/** A parquet TIMESTAMP value decoded at full (nanosecond) precision. */
export class ParquetExactTimestamp {
  readonly ns: bigint;

  constructor(ns: bigint) {
    this.ns = ns;
  }
}

/** hyparquet parsers that keep every TIMESTAMP unit exact. */
export const EXACT_TIMESTAMP_PARSERS: Partial<ParquetParsers> = {
  timestampFromMilliseconds: (millis) =>
    new ParquetExactTimestamp(BigInt(millis) * NS_PER_MS),
  timestampFromMicroseconds: (micros) =>
    new ParquetExactTimestamp(BigInt(micros) * NS_PER_US),
  timestampFromNanoseconds: (nanos) => new ParquetExactTimestamp(BigInt(nanos)),
};

export type NqParquetRow = Readonly<Record<string, unknown>>;

export interface NqBarQuery {
  readonly contract: string;
  readonly startInclusive: Date;
  readonly endInclusive: Date;
}

export type NqRowRejectionReason =
  | "MISSING_CONTRACT"
  | "UNALIGNED_MINUTE"
  | "INVALID_EVENT_TIMESTAMP"
  | "TIMESTAMP_CONFLICT"
  | "MISSING_TRADING_DATE"
  | "NON_FINITE_FIELD"
  | "NON_POSITIVE_PRICE"
  | "OHLC_INVARIANT_VIOLATION"
  | "INVALID_VOLUME"
  | "DUPLICATE_MINUTE";

export interface NqRowRejection {
  readonly reason: NqRowRejectionReason;
  readonly openAt: Date;
}

const describe = (value: unknown): string => {
  if (value === null) return "null";
  if (value instanceof Date) return "Date";
  return typeof value;
};

/**
 * `timestamp_utc` → exact epoch nanoseconds. Only values decoded through
 * {@link EXACT_TIMESTAMP_PARSERS} are accepted; Dates, numbers, bigints and
 * strings are refused because their precision or unit is unknown.
 */
export function parquetTimestampToNs(value: unknown): bigint {
  if (value instanceof ParquetExactTimestamp) return value.ns;
  throw new NqArchiveDataError(
    `Unrecognised timestamp_utc (${describe(value)}). Expected a UTC parquet ` +
      "TIMESTAMP decoded at full precision.",
  );
}

const toTradingDate = (value: unknown): string | null => {
  if (typeof value === "string") return isIsoDate(value) ? value : null;
  // A parquet DATE column arrives as a Date at UTC midnight.
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) && ms % DAY_MS === 0
      ? value.toISOString().slice(0, 10)
      : null;
  }
  return null;
};

/** `ts_event_ns` → exact ns, null when absent, "invalid" when imprecise. */
const toEventNs = (value: unknown): bigint | null | "invalid" => {
  if (value === null || value === undefined) return null;
  if (value instanceof ParquetExactTimestamp) return value.ns;
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
  return "invalid";
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const convertRow = (
  row: NqParquetRow,
  contract: string,
  ns: bigint,
  openAt: Date,
): NqMinuteBar | NqRowRejectionReason => {
  if (ns % NS_PER_MINUTE !== ZERO) return "UNALIGNED_MINUTE";
  const eventNs = toEventNs(row.ts_event_ns);
  if (eventNs === "invalid") return "INVALID_EVENT_TIMESTAMP";
  if (eventNs !== null && eventNs !== ns) return "TIMESTAMP_CONFLICT";

  const tradingDate = toTradingDate(row.trading_date);
  if (tradingDate === null) return "MISSING_TRADING_DATE";

  const open = toFiniteNumber(row.open);
  const high = toFiniteNumber(row.high);
  const low = toFiniteNumber(row.low);
  const close = toFiniteNumber(row.close);
  if (open === null || high === null || low === null || close === null) {
    return "NON_FINITE_FIELD";
  }
  if (!(open > 0 && high > 0 && low > 0 && close > 0)) {
    return "NON_POSITIVE_PRICE";
  }
  if (low > Math.min(open, close) || high < Math.max(open, close)) {
    return "OHLC_INVARIANT_VIOLATION";
  }
  const volume = toFiniteNumber(row.volume);
  if (volume === null || volume < 0) return "INVALID_VOLUME";

  return {
    openAt,
    tradingDate,
    contract,
    open,
    high,
    low,
    close,
    volume,
    tsEventNs: eventNs,
  };
};

/** Pure parquet-row → bar conversion for one contract and inclusive window. */
export function parquetRowsToBars(
  rows: readonly NqParquetRow[],
  query: NqBarQuery,
): { bars: NqMinuteBar[]; rejections: NqRowRejection[] } {
  const startNs = BigInt(query.startInclusive.getTime()) * NS_PER_MS;
  const endNs = BigInt(query.endInclusive.getTime()) * NS_PER_MS;
  const candidates: NqMinuteBar[] = [];
  const rejections: NqRowRejection[] = [];

  for (const row of rows) {
    const ns = parquetTimestampToNs(row.timestamp_utc);
    if (ns < startNs || ns > endNs) continue;
    const openAt = new Date(Number(ns / NS_PER_MS));
    if (typeof row.contract !== "string" || row.contract === "") {
      rejections.push({ reason: "MISSING_CONTRACT", openAt });
      continue;
    }
    if (row.contract !== query.contract) continue;
    const converted = convertRow(row, query.contract, ns, openAt);
    if (typeof converted === "string") {
      rejections.push({ reason: converted, openAt });
    } else {
      candidates.push(converted);
    }
  }

  const perMinute = new Map<number, number>();
  for (const bar of candidates) {
    const t = bar.openAt.getTime();
    perMinute.set(t, (perMinute.get(t) ?? 0) + 1);
  }
  const bars: NqMinuteBar[] = [];
  for (const bar of candidates) {
    if ((perMinute.get(bar.openAt.getTime()) ?? 0) > 1) {
      rejections.push({ reason: "DUPLICATE_MINUTE", openAt: bar.openAt });
    } else {
      bars.push(bar);
    }
  }

  bars.sort((a, b) => a.openAt.getTime() - b.openAt.getTime());
  return { bars, rejections };
}

export type NqParquetRowReader = (
  args: NqBarQuery & { readonly path: string },
) => Promise<readonly NqParquetRow[]>;

const assertUtcTimestampColumn = (metadata: FileMetaData): void => {
  const element = metadata.schema.find((e) => e.name === "timestamp_utc");
  const logical = element?.logical_type;
  const utcTimestamp =
    element?.type === "INT64" &&
    (logical
      ? logical.type === "TIMESTAMP" && logical.isAdjustedToUTC
      : element.converted_type === "TIMESTAMP_MILLIS" ||
        element.converted_type === "TIMESTAMP_MICROS");
  if (!utcTimestamp) {
    throw new NqArchiveDataError(
      "timestamp_utc must be a UTC-adjusted parquet TIMESTAMP column; found " +
        (element
          ? `${element.type ?? "group"} ${logical?.type ?? element.converted_type ?? "unannotated"}`
          : "no such column"),
    );
  }
};

/** Whether a row group must be decoded for the window (unknown → yes). */
const mayOverlap = (group: RowGroup, startNs: bigint, endNs: bigint): boolean => {
  const stats = group.columns.find(
    (chunk) => chunk.meta_data?.path_in_schema.join(".") === "timestamp_utc",
  )?.meta_data?.statistics;
  const nulls = stats?.null_count;
  if (nulls !== undefined && nulls > ZERO) {
    throw new NqArchiveDataError(
      `timestamp_utc has ${nulls} null value(s); refusing rather than dropping them`,
    );
  }
  const min = stats?.min_value ?? stats?.min;
  const max = stats?.max_value ?? stats?.max;
  if (
    nulls === undefined ||
    !(min instanceof ParquetExactTimestamp) ||
    !(max instanceof ParquetExactTimestamp)
  ) {
    return true;
  }
  return max.ns >= startNs && min.ns <= endNs;
};

const readRowsWithHyparquet: NqParquetRowReader = async ({
  path,
  startInclusive,
  endInclusive,
}) => {
  const file = await asyncBufferFromFile(path);
  const metadata = await parquetMetadataAsync(file, {
    parsers: EXACT_TIMESTAMP_PARSERS,
  });
  assertUtcTimestampColumn(metadata);

  const startNs = BigInt(startInclusive.getTime()) * NS_PER_MS;
  const endNs = BigInt(endInclusive.getTime()) * NS_PER_MS;
  const rows: NqParquetRow[] = [];
  let rowStart = 0;
  for (const group of metadata.row_groups) {
    const rowEnd = rowStart + Number(group.num_rows);
    if (mayOverlap(group, startNs, endNs)) {
      rows.push(
        ...(await parquetReadObjects({
          file,
          metadata,
          columns: [...COLUMNS],
          rowStart,
          rowEnd,
          compressors,
          parsers: EXACT_TIMESTAMP_PARSERS,
        })),
      );
    }
    rowStart = rowEnd;
  }
  return rows;
};

const summarise = (rejections: readonly NqRowRejection[]): string => {
  const counts = new Map<NqRowRejectionReason, number>();
  for (const { reason } of rejections) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts].map(([reason, n]) => `${reason}×${n}`).join(", ");
};

export function createParquetNqBarStore(
  outrightParquetPath: string,
  deps: { readonly readRows?: NqParquetRowReader } = {},
): NqBarStore {
  const readRows = deps.readRows ?? readRowsWithHyparquet;
  return {
    async queryWithinContract(query) {
      const rows = await readRows({ ...query, path: outrightParquetPath });
      const { bars, rejections } = parquetRowsToBars(rows, query);
      if (rejections.length > 0) {
        throw new NqArchiveDataError(
          `Refused ${rejections.length} archive row(s) for ${query.contract} in ` +
            `[${query.startInclusive.toISOString()}, ${query.endInclusive.toISOString()}]: ` +
            summarise(rejections),
        );
      }
      return bars;
    },
  };
}
