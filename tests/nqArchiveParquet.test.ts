import { describe, expect, it } from "vitest";

import {
  NqArchiveDataError,
  createParquetNqBarStore,
  parquetRowsToBars,
  parquetTimestampToDate,
} from "@/services/market/nqArchive";

type Row = Record<string, unknown>;

const row = (iso: string, overrides: Row = {}): Row => ({
  ts_event_ns: BigInt(Date.parse(iso)) * BigInt(1_000_000),
  timestamp_utc: new Date(iso),
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

describe("parquetTimestampToDate (F12)", () => {
  it("accepts Dates and zoned ISO strings", () => {
    expect(
      parquetTimestampToDate(new Date("2024-06-12T12:00:00Z")).toISOString(),
    ).toBe("2024-06-12T12:00:00.000Z");
    expect(
      parquetTimestampToDate("2024-06-12T08:00:00-04:00").toISOString(),
    ).toBe("2024-06-12T12:00:00.000Z");
  });

  it("fails on raw numeric timestamps whose unit is unknown", () => {
    const ms = Date.parse("2024-06-12T12:00:00Z");
    expect(() => parquetTimestampToDate(ms)).toThrow(NqArchiveDataError);
    expect(() => parquetTimestampToDate(ms * 1000)).toThrow(NqArchiveDataError);
    expect(() =>
      parquetTimestampToDate(BigInt(ms) * BigInt(1_000_000)),
    ).toThrow(NqArchiveDataError);
  });

  it("fails on unzoned strings, invalid dates and other types", () => {
    expect(() => parquetTimestampToDate("2024-06-12 12:00:00")).toThrow(
      NqArchiveDataError,
    );
    expect(() => parquetTimestampToDate(new Date(Number.NaN))).toThrow(
      NqArchiveDataError,
    );
    expect(() => parquetTimestampToDate(null)).toThrow(NqArchiveDataError);
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
    expect(bars[0]!.tsEventNs).toBe(
      BigInt(Date.parse("2024-06-12T12:00:00.000Z")) * BigInt(1_000_000),
    );
  });

  it("accepts a parquet DATE trading_date at UTC midnight", () => {
    const { bars } = parquetRowsToBars(
      [row("2024-06-12T12:00:00.000Z", { trading_date: new Date("2024-06-12") })],
      query,
    );
    expect(bars[0]!.tradingDate).toBe("2024-06-12");
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
        row("2024-06-12T12:00:00.000Z", { high: 100.5 }), // close above high
        row("2024-06-12T12:01:00.000Z", { low: 100.5 }), // open below low
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

  it("refuses duplicate and non-minute-aligned bars", () => {
    const { bars, rejections } = parquetRowsToBars(
      [
        row("2024-06-12T12:00:00.000Z"),
        row("2024-06-12T12:00:00.000Z", { close: 100.5 }),
        row("2024-06-12T12:01:30.000Z"),
        row("2024-06-12T12:02:00.000Z"),
      ],
      query,
    );
    expect(bars.map((b) => b.openAt.toISOString())).toEqual([
      "2024-06-12T12:02:00.000Z",
    ]);
    expect(rejections.map((r) => r.reason)).toEqual([
      "UNALIGNED_MINUTE",
      "DUPLICATE_MINUTE",
      "DUPLICATE_MINUTE",
    ]);
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

  it("fails the whole conversion on an unrecognised timestamp", () => {
    expect(() =>
      parquetRowsToBars(
        [row("2024-06-12T12:00:00.000Z", { timestamp_utc: 1_718_193_600_000 })],
        query,
      ),
    ).toThrow(NqArchiveDataError);
  });

  it("does not trust imprecise numeric ns event timestamps", () => {
    const { bars } = parquetRowsToBars(
      [row("2024-06-12T12:00:00.000Z", { ts_event_ns: 1.718193600e18 })],
      query,
    );
    expect(bars[0]!.tsEventNs).toBeNull();
  });
});

describe("createParquetNqBarStore", () => {
  it("returns validated bars from the injected row reader", async () => {
    const store = createParquetNqBarStore("/nonexistent.parquet", {
      readRows: async () => [row("2024-06-12T12:00:00.000Z")],
    });
    const bars = await store.queryWithinContract(query);
    expect(bars).toHaveLength(1);
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
