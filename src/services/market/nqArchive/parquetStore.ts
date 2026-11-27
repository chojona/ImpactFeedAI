/**
 * Read-only parquet bar store over the local Databento NQ outright archive.
 *
 * Uses hyparquet + ZSTD compressors. Never writes. Filters to a single contract
 * and UTC window so the full 6.7M-row file is not materialised.
 *
 * Row conversion fails closed: a timestamp whose unit cannot be known throws,
 * and any in-window row that is malformed (no trading_date, broken OHLC,
 * duplicate minute, …) makes the whole query throw rather than silently
 * dropping or repairing it.
 */
import { asyncBufferFromFile, parquetQuery } from "hyparquet";
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

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const ZONED_ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export type NqParquetRow = Readonly<Record<string, unknown>>;

export interface NqBarQuery {
  readonly contract: string;
  readonly startInclusive: Date;
  readonly endInclusive: Date;
}

export type NqRowRejectionReason =
  | "UNALIGNED_MINUTE"
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

const describe = (value: unknown): string =>
  value instanceof Date ? "Invalid Date" : typeof value;

/**
 * `timestamp_utc` → Date. hyparquet already converts annotated parquet
 * TIMESTAMP columns (ms/µs/ns) to Date; a raw number or bigint has no unit
 * and is refused rather than guessed.
 */
export function parquetTimestampToDate(value: unknown): Date {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "string" && ZONED_ISO_TIMESTAMP.test(value)) {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date;
  }
  throw new NqArchiveDataError(
    `Unrecognised timestamp_utc (${describe(value)}). Expected a parquet ` +
      "TIMESTAMP column or a zoned ISO-8601 string; raw numbers are refused " +
      "because their unit is ambiguous.",
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

const toBigIntNs = (value: unknown): bigint | null => {
  if (typeof value === "bigint") return value;
  // ns-scale epochs exceed 2^53, so a JS number has already lost precision.
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
  return null;
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

type BarOrRejection = NqMinuteBar | NqRowRejectionReason;

const convertRow = (
  row: NqParquetRow,
  contract: string,
  openAt: Date,
): BarOrRejection => {
  if (openAt.getTime() % MINUTE_MS !== 0) return "UNALIGNED_MINUTE";
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
    tsEventNs: toBigIntNs(row.ts_event_ns),
  };
};

/** Pure parquet-row → bar conversion for one contract and inclusive window. */
export function parquetRowsToBars(
  rows: readonly NqParquetRow[],
  query: NqBarQuery,
): { bars: NqMinuteBar[]; rejections: NqRowRejection[] } {
  const startMs = query.startInclusive.getTime();
  const endMs = query.endInclusive.getTime();
  const candidates: NqMinuteBar[] = [];
  const rejections: NqRowRejection[] = [];

  for (const row of rows) {
    if (row.contract !== query.contract) continue;
    const openAt = parquetTimestampToDate(row.timestamp_utc);
    const t = openAt.getTime();
    if (t < startMs || t > endMs) continue;
    const converted = convertRow(row, query.contract, openAt);
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

const readRowsWithHyparquet: NqParquetRowReader = async ({
  path,
  contract,
  startInclusive,
  endInclusive,
}) => {
  const file = await asyncBufferFromFile(path);
  // parquetQuery prunes row groups via column statistics when available;
  // parquetRowsToBars re-applies the window in case stats are absent.
  return parquetQuery({
    file,
    columns: [...COLUMNS],
    compressors,
    filter: {
      $and: [
        { contract: { $eq: contract } },
        { timestamp_utc: { $gte: startInclusive } },
        { timestamp_utc: { $lte: endInclusive } },
      ],
    },
  });
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
