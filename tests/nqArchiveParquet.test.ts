import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  NqArchiveDataError,
  ParquetExactTimestamp,
  createParquetNqBarStore,
  parquetRowsToBars,
  parquetTimestampToNs,
} from "@/services/market/nqArchive";

type Row = Record<string, unknown>;

const NS_PER_MS = BigInt(1_000_000);
const nsOf = (iso: string, extraNs = 0): bigint =>
  BigInt(Date.parse(iso)) * NS_PER_MS + BigInt(extraNs);
const ts = (iso: string, extraNs = 0) =>
  new ParquetExactTimestamp(nsOf(iso, extraNs));

const row = (iso: string, overrides: Row = {}): Row => ({
  ts_event_ns: nsOf(iso),
  timestamp_utc: ts(iso),
  trading_date: iso.slice(0, 10),
  contract: "NQM24",
  open: 100,
  high: 102,
  low: 99,
  close: 101,
  volume: 3,
  ...overrides,
});

const query = {
  contract: "NQM24",
  startInclusive: new Date("2024-06-12T12:00:00.000Z"),
  endInclusive: new Date("2024-06-12T12:10:00.000Z"),
};

const fixture = (name: string): string =>
  fileURLToPath(new URL(`./fixtures/nqArchive/parquet/${name}`, import.meta.url));

describe("parquetTimestampToNs (F12 / review 6)", () => {
  it("returns the exact nanosecond value of a decoded parquet TIMESTAMP", () => {
    expect(parquetTimestampToNs(ts("2024-06-12T12:00:00.000Z", 1))).toBe(
      nsOf("2024-06-12T12:00:00.000Z") + BigInt(1),
    );
  });

  it("fails on every representation whose precision or unit is unknown", () => {
    const ms = Date.parse("2024-06-12T12:00:00Z");
    for (const value of [
      new Date(ms),
      ms,
      BigInt(ms) * NS_PER_MS,
      "2024-06-12T12:00:00Z",
      null,
      undefined,
    ]) {
      expect(() => parquetTimestampToNs(value)).toThrow(NqArchiveDataError);
    }
  });
});

describe("parquetRowsToBars (F12)", () => {
  it("converts valid rows and sorts them", () => {
    const { bars, rejections } = parquetRowsToBars(
      [row("2024-06-12T12:01:00.000Z"), row("2024-06-12T12:00:00.000Z")],
      query,
    );
    expect(rejections).toEqual([]);
    expect(bars.map((b) => b.openAt.toISOString())).toEqual([
      "2024-06-12T12:00:00.000Z",
      "2024-06-12T12:01:00.000Z",
    ]);
    expect(bars[0]!.tsEventNs).toBe(nsOf("2024-06-12T12:00:00.000Z"));
  });

  it("accepts a parquet DATE trading_date and a TIMESTAMP-typed ts_event_ns", () => {
    const { bars, rejections } = parquetRowsToBars(
      [
        row("2024-06-12T12:00:00.000Z", {
          trading_date: new Date("2024-06-12"),
          ts_event_ns: ts("2024-06-12T12:00:00.000Z"),
        }),
      ],
      query,
    );
    expect(rejections).toEqual([]);
    expect(bars[0]!.tradingDate).toBe("2024-06-12");
  });

  it("keeps a bar with no ts_event_ns but records it as unknown", () => {
    const { bars } = parquetRowsToBars(
      [row("2024-06-12T12:00:00.000Z", { ts_event_ns: null })],
      query,
    );
    expect(bars[0]!.tsEventNs).toBeNull();
  });

  it("refuses rows without a usable trading_date instead of using the UTC date", () => {
    const { bars, rejections } = parquetRowsToBars(
      [
        row("2024-06-12T12:00:00.000Z", { trading_date: undefined }),
        row("2024-06-12T12:01:00.000Z", { trading_date: "2024-06-12T00:00" }),
        row("2024-06-12T12:02:00.000Z", {
          trading_date: new Date("2024-06-12T04:00:00Z"),
        }),
      ],
      query,
    );
    expect(bars).toEqual([]);
    expect(rejections.map((r) => r.reason)).toEqual([
      "MISSING_TRADING_DATE",
      "MISSING_TRADING_DATE",
      "MISSING_TRADING_DATE",
    ]);
  });

  it("refuses OHLC invariant violations", () => {
    const { bars, rejections } = parquetRowsToBars(
      [
        row("2024-06-12T12:00:00.000Z", { high: 100.5 }),
        row("2024-06-12T12:01:00.000Z", { low: 100.5 }),
        row("2024-06-12T12:02:00.000Z", { high: 98, low: 99 }),
      ],
      query,
    );
    expect(bars).toEqual([]);
    expect(new Set(rejections.map((r) => r.reason))).toEqual(
      new Set(["OHLC_INVARIANT_VIOLATION"]),
    );
  });

  it("refuses non-finite, non-positive and negative-volume rows", () => {
    const { rejections } = parquetRowsToBars(
      [
        row("2024-06-12T12:00:00.000Z", { close: "abc" }),
        row("2024-06-12T12:01:00.000Z", { open: 0, low: 0 }),
        row("2024-06-12T12:02:00.000Z", { volume: -1 }),
      ],
      query,
    );
    expect(rejections.map((r) => r.reason)).toEqual([
      "NON_FINITE_FIELD",
      "NON_POSITIVE_PRICE",
      "INVALID_VOLUME",
    ]);
  });

  it("checks minute alignment at full nanosecond precision", () => {
    const { bars, rejections } = parquetRowsToBars(
      [
        row("2024-06-12T12:00:00.000Z"),
        row("2024-06-12T12:01:00.000Z", {
          timestamp_utc: ts("2024-06-12T12:01:00.000Z", 1),
          ts_event_ns: nsOf("2024-06-12T12:01:00.000Z", 1),
        }),
        row("2024-06-12T12:02:00.000Z", {
          timestamp_utc: ts("2024-06-12T12:02:00.000Z", 1_000),
          ts_event_ns: null,
        }),
      ],
      query,
    );
    expect(bars.map((b) => b.openAt.toISOString())).toEqual([
      "2024-06-12T12:00:00.000Z",
    ]);
    expect(rejections.map((r) => r.reason)).toEqual([
      "UNALIGNED_MINUTE",
      "UNALIGNED_MINUTE",
    ]);
  });

  it("refuses rows whose ts_event_ns disagrees with timestamp_utc", () => {
    const { bars, rejections } = parquetRowsToBars(
      [
        row("2024-06-12T12:01:00.000Z", {
          ts_event_ns: nsOf("2024-06-12T12:00:00.000Z"),
        }),
        row("2024-06-12T12:02:00.000Z", { ts_event_ns: 1.7181937e18 }),
      ],
      query,
    );
    expect(bars).toEqual([]);
    expect(rejections.map((r) => r.reason)).toEqual([
      "TIMESTAMP_CONFLICT",
      "INVALID_EVENT_TIMESTAMP",
    ]);
  });

  it("refuses duplicate minutes", () => {
    const { bars, rejections } = parquetRowsToBars(
      [
        row("2024-06-12T12:00:00.000Z"),
        row("2024-06-12T12:00:00.000Z", { close: 100.5 }),
        row("2024-06-12T12:02:00.000Z"),
      ],
      query,
    );
    expect(bars).toHaveLength(1);
    expect(rejections.map((r) => r.reason)).toEqual([
      "DUPLICATE_MINUTE",
      "DUPLICATE_MINUTE",
    ]);
  });

  it("refuses in-window rows with no contract before filtering by contract", () => {
    const { rejections } = parquetRowsToBars(
      [
        row("2024-06-12T12:00:00.000Z", { contract: null }),
        row("2024-06-12T13:00:00.000Z", { contract: null }),
      ],
      query,
    );
    expect(rejections.map((r) => r.reason)).toEqual(["MISSING_CONTRACT"]);
  });

  it("filters other contracts and out-of-window rows without rejecting them", () => {
    const { bars, rejections } = parquetRowsToBars(
      [
        row("2024-06-12T12:00:00.000Z", { contract: "NQU24", high: 1 }),
        row("2024-06-12T11:59:00.000Z"),
        row("2024-06-12T12:11:00.000Z"),
      ],
      query,
    );
    expect(bars).toEqual([]);
    expect(rejections).toEqual([]);
  });

  it("validates timestamps on every row before any filtering", () => {
    for (const bad of [
      row("2024-06-12T12:00:00.000Z", {
        contract: "NQU24",
        timestamp_utc: 1_718_193_600_000,
      }),
      row("2024-06-13T12:00:00.000Z", { timestamp_utc: null }),
    ]) {
      expect(() =>
        parquetRowsToBars([row("2024-06-12T12:00:00.000Z"), bad], query),
      ).toThrow(NqArchiveDataError);
    }
  });
});

describe("createParquetNqBarStore with an injected reader", () => {
  it("returns validated bars", async () => {
    const store = createParquetNqBarStore("/nonexistent.parquet", {
      readRows: async () => [row("2024-06-12T12:00:00.000Z")],
    });
    expect(await store.queryWithinContract(query)).toHaveLength(1);
  });

  it("fails closed when any in-window row is rejected", async () => {
    const store = createParquetNqBarStore("/nonexistent.parquet", {
      readRows: async () => [
        row("2024-06-12T12:00:00.000Z"),
        row("2024-06-12T12:01:00.000Z", { trading_date: null }),
      ],
    });
    await expect(store.queryWithinContract(query)).rejects.toThrow(
      /MISSING_TRADING_DATE/,
    );
  });
});

describe("createParquetNqBarStore over synthetic parquet files (review 6–7)", () => {
  const read = (name: string, q = query) =>
    createParquetNqBarStore(fixture(name)).queryWithinContract(q);

  it("reads a TIMESTAMP(NANOS, UTC) file across row groups for one contract", async () => {
    const bars = await read("bars_ok.parquet");
    expect(bars).toHaveLength(10);
    expect(bars.every((b) => b.contract === "NQM24")).toBe(true);
    expect(bars[0]!.tsEventNs).toBe(nsOf("2024-06-12T12:00:00.000Z"));

    const nextDay = await read("bars_ok.parquet", {
      contract: "NQM24",
      startInclusive: new Date("2024-06-13T12:00:00.000Z"),
      endInclusive: new Date("2024-06-13T12:10:00.000Z"),
    });
    expect(nextDay.map((b) => b.openAt.toISOString())[0]).toBe(
      "2024-06-13T12:00:00.000Z",
    );
    expect(nextDay).toHaveLength(5);
  });

  it("reads a TIMESTAMP(MILLIS, UTC) file", async () => {
    expect(await read("bars_ms.parquet")).toHaveLength(3);
  });

  it("refuses sub-millisecond offsets that a Date would hide", async () => {
    await expect(read("bars_sub_ns.parquet")).rejects.toThrow(/UNALIGNED_MINUTE/);
    await expect(read("bars_sub_us.parquet")).rejects.toThrow(/UNALIGNED_MINUTE/);
  });

  it("refuses a row whose timestamp_utc and ts_event_ns disagree", async () => {
    await expect(read("bars_ts_conflict.parquet")).rejects.toThrow(
      /TIMESTAMP_CONFLICT/,
    );
  });

  it("refuses timestamp_utc columns that are not UTC parquet TIMESTAMPs", async () => {
    for (const name of [
      "bars_raw_int64.parquet",
      "bars_string_ts.parquet",
      "bars_naive_ts.parquet",
    ]) {
      await expect(read(name)).rejects.toThrow(/timestamp_utc/);
    }
  });

  it("refuses null timestamps instead of letting the query drop them", async () => {
    await expect(read("bars_null_ts.parquet")).rejects.toThrow(/null/i);
  });

  it("refuses an in-window row with a null contract", async () => {
    await expect(read("bars_null_contract.parquet")).rejects.toThrow(
      /MISSING_CONTRACT/,
    );
  });
});
