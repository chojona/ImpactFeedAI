/**
 * Read-only parquet bar store over the local Databento NQ outright archive.
 *
 * Uses hyparquet + ZSTD compressors. Never writes. Filters to a single contract
 * and UTC window so the full 6.7M-row file is not materialised.
 */
import { asyncBufferFromFile, parquetQuery } from "hyparquet";
import { compressors } from "hyparquet-compressors";

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

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    // hyparquet may yield epoch ms or seconds; archive timestamps are ms-scale.
    const ms = value > 1e12 ? value : value > 1e10 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value === "bigint") {
      // Nanoseconds → ms.
    const ms = Number(value / BigInt(1_000_000));
    const date = new Date(ms);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value === "string" && value.length > 0) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
};

const toTradingDate = (value: unknown, fallback: Date): string => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  // Archive trading_date is a CME date, not necessarily the UTC calendar day of
  // the bar open. When the column is missing we fall back to UTC date and mark
  // that only as a last resort for malformed fixtures.
  return fallback.toISOString().slice(0, 10);
};

const toBigIntNs = (value: unknown): bigint | null => {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
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

export function createParquetNqBarStore(outrightParquetPath: string): NqBarStore {
  return {
    async queryWithinContract({ contract, startInclusive, endInclusive }) {
      const file = await asyncBufferFromFile(outrightParquetPath);
      const startMs = startInclusive.getTime();
      const endMs = endInclusive.getTime();

      // parquetQuery prunes row groups via column statistics when available.
      // A second in-process filter keeps the window tight if stats are absent.
      const rows = await parquetQuery({
        file,
        columns: [...COLUMNS],
        compressors,
        filter: {
          $and: [
            { contract: { $eq: contract } },
            { timestamp_utc: { $gte: new Date(startMs) } },
            { timestamp_utc: { $lte: new Date(endMs) } },
          ],
        },
      });

      const bars: NqMinuteBar[] = [];
      for (const row of rows) {
        if (row.contract !== contract) continue;
        const openAt = toDate(row.timestamp_utc);
        if (!openAt) continue;
        const t = openAt.getTime();
        if (t < startMs || t > endMs) continue;

        const open = toFiniteNumber(row.open);
        const high = toFiniteNumber(row.high);
        const low = toFiniteNumber(row.low);
        const close = toFiniteNumber(row.close);
        const volume = toFiniteNumber(row.volume);
        if (
          open === null ||
          high === null ||
          low === null ||
          close === null ||
          volume === null
        ) {
          continue;
        }
        if (!(open > 0 && high > 0 && low > 0 && close > 0)) continue;

        bars.push({
          openAt,
          tradingDate: toTradingDate(row.trading_date, openAt),
          contract,
          open,
          high,
          low,
          close,
          volume,
          tsEventNs: toBigIntNs(row.ts_event_ns),
        });
      }

      return bars.sort((a, b) => a.openAt.getTime() - b.openAt.getTime());
    },
  };
}
