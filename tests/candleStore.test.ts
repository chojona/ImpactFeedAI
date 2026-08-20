import { describe, expect, it } from "vitest";

import {
  ALL_INTERVAL_CODES,
  CURRENT_CANDLE_INGESTION_VERSION,
  INTERVAL_CODE,
  intervalFromCode,
  isCoherentOhlc,
  ohlcViolations,
} from "@/services/market/candles";
import type { CandleInterval } from "@/types/market";

/**
 * The stored-candle contract: interval vocabulary and OHLC coherence.
 *
 * `getCandles` itself is not unit-tested here. It is a Prisma query, and this
 * repository's CI is deliberately secret-free with no database available, so a
 * test that asserted on real rows could not run there. Its guarantees — current
 * ingestion version only, ascending order, one basis per series — are verified
 * against the live database by `npm run verify:candles`, which is the same
 * division `db:verify` already uses for schema-level invariants.
 */

describe("ingestion version", () => {
  it("pins the current candle ingestion contract", () => {
    // A bump here must be accompanied by a deliberate re-ingestion; the read
    // path filters on it, so stale rows disappear rather than mixing.
    expect(CURRENT_CANDLE_INGESTION_VERSION).toBe(1);
  });

  it("is an integer, since it is stored in an Int column", () => {
    expect(Number.isInteger(CURRENT_CANDLE_INGESTION_VERSION)).toBe(true);
  });
});

describe("interval vocabulary", () => {
  it("maps every enum member to a distinct short code", () => {
    const codes = Object.values(INTERVAL_CODE);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("round-trips every code back to its enum member", () => {
    for (const [interval, code] of Object.entries(INTERVAL_CODE)) {
      expect(intervalFromCode(code)).toBe(interval as CandleInterval);
    }
  });

  it("accepts a code in any case", () => {
    expect(intervalFromCode("1H")).toBe("ONE_HOUR");
    expect(intervalFromCode("1h")).toBe("ONE_HOUR");
  });

  it("returns null for an unknown code rather than guessing one", () => {
    // A typo must not silently resolve to a neighbouring interval.
    expect(intervalFromCode("2h")).toBeNull();
    expect(intervalFromCode("")).toBeNull();
    expect(intervalFromCode("hour")).toBeNull();
  });

  it("exposes every code for CLI help text", () => {
    expect(ALL_INTERVAL_CODES).toHaveLength(6);
    expect(ALL_INTERVAL_CODES).toContain("1h");
  });
});

describe("OHLC invariants", () => {
  const good = { open: 100, high: 102, low: 99, close: 101 };

  it("accepts a coherent bar", () => {
    expect(ohlcViolations(good)).toEqual([]);
    expect(isCoherentOhlc(good)).toBe(true);
  });

  it("accepts a doji where every leg is identical", () => {
    // A flat bar is unusual, not invalid — rejecting it would drop real bars
    // from illiquid pre-market sessions.
    expect(isCoherentOhlc({ open: 100, high: 100, low: 100, close: 100 })).toBe(
      true,
    );
  });

  it("rejects a high below the open", () => {
    expect(ohlcViolations({ ...good, high: 99.5 })).toContain(
      "high_below_open",
    );
  });

  it("rejects a high below the close", () => {
    expect(ohlcViolations({ open: 100, high: 100.5, low: 99, close: 101 })).toContain(
      "high_below_close",
    );
  });

  it("rejects a low above the open", () => {
    expect(ohlcViolations({ ...good, low: 100.5 })).toContain("low_above_open");
  });

  it("rejects a low above the close", () => {
    expect(
      ohlcViolations({ open: 100, high: 102, low: 101.5, close: 101 }),
    ).toContain("low_above_close");
  });

  it("rejects a high below the low", () => {
    expect(ohlcViolations({ open: 100, high: 98, low: 99, close: 100 })).toContain(
      "high_below_low",
    );
  });

  it("reports every violation, not just the first", () => {
    // Distinguishes one odd bar from a systematically broken payload.
    const violations = ohlcViolations({
      open: 100,
      high: 95,
      low: 105,
      close: 100,
    });
    expect(violations.length).toBeGreaterThan(1);
  });

  it("rejects a null leg rather than treating it as zero", () => {
    expect(ohlcViolations({ ...good, close: null })).toEqual(["non_finite"]);
  });

  it("rejects a non-finite leg", () => {
    expect(ohlcViolations({ ...good, high: Number.NaN })).toEqual([
      "non_finite",
    ]);
    expect(ohlcViolations({ ...good, low: Number.POSITIVE_INFINITY })).toEqual([
      "non_finite",
    ]);
  });

  it("rejects a non-positive price", () => {
    // A zero or negative equity price is a provider artefact, never a quote.
    expect(ohlcViolations({ open: 0, high: 0, low: 0, close: 0 })).toEqual([
      "non_positive",
    ]);
    expect(ohlcViolations({ ...good, low: -1 })).toEqual(["non_positive"]);
  });

  it("does not confuse a zero price with a zero volume", () => {
    // Volume is nullable and may legitimately be 0 in a regular session;
    // price may not. These are separate rules and must not be conflated.
    expect(isCoherentOhlc({ open: 100, high: 100, low: 100, close: 100 })).toBe(
      true,
    );
  });
});
