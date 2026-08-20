import { describe, expect, it } from "vitest";

import {
  EXTENDED_SESSION_MINUTES,
  INTERVAL_LOOKBACK_DAYS,
  REGULAR_SESSION_MINUTES,
  barsPerSession,
  classifySession,
  estimateCandleRows,
  finestReachableInterval,
  intervalReachableAt,
  newYorkMinuteOfDay,
  normalizeProviderVolume,
} from "../scripts/ingest/candle-semantics";
import type { CandleInterval } from "@/types/market";

/**
 * These encode measured provider behaviour, not preferences. Each one exists
 * because getting it wrong produces a plausible-looking candle rather than an
 * error: a fabricated zero volume, a bar filed under the wrong session, or a
 * backfill that believes it can reach history the provider has already dropped.
 */

/* ───────────────────────────── session boundaries ───────────────────────── */

// 2025-05-13 is EDT (UTC−4); 2025-01-15 is EST (UTC−5).
const edt = (hhmm: string) => new Date(`2025-05-13T${hhmm}:00.000Z`);
const est = (hhmm: string) => new Date(`2025-01-15T${hhmm}:00.000Z`);

describe("newYorkMinuteOfDay", () => {
  it("converts a summer instant using EDT", () => {
    expect(newYorkMinuteOfDay(edt("13:30"))).toBe(9 * 60 + 30);
  });

  it("converts a winter instant using EST", () => {
    // Same 09:30 ET wall clock, one hour later in UTC.
    expect(newYorkMinuteOfDay(est("14:30"))).toBe(9 * 60 + 30);
  });

  it("reports midnight as zero rather than 1440", () => {
    expect(newYorkMinuteOfDay(edt("04:00"))).toBe(0);
  });
});

describe("classifySession", () => {
  it("treats the opening bar as regular", () => {
    expect(classifySession(edt("13:30"))).toBe("REGULAR");
  });

  it("treats a pre-market bar as extended", () => {
    // 04:00 ET — the first bar Yahoo actually returns on every intraday call.
    expect(classifySession(edt("08:00"))).toBe("EXTENDED");
  });

  it("treats the 16:00 bar as extended, not as the last regular bar", () => {
    // The bar stamped at the close opens after it; filing it as regular would
    // append an extended-hours print to the regular session.
    expect(classifySession(edt("20:00"))).toBe("EXTENDED");
  });

  it("treats the last intraday bar before the close as regular", () => {
    expect(classifySession(edt("19:55"))).toBe("REGULAR");
  });

  it("classifies consistently across the DST boundary", () => {
    // 09:30 ET in January and in May are both regular despite differing UTC.
    expect(classifySession(est("14:30"))).toBe("REGULAR");
    expect(classifySession(edt("13:30"))).toBe("REGULAR");
    // 08:30 ET — a CPI release instant — is extended in both offsets.
    expect(classifySession(est("13:30"))).toBe("EXTENDED");
    expect(classifySession(edt("12:30"))).toBe("EXTENDED");
  });
});

/* ─────────────────────────────── volume ─────────────────────────────────── */

describe("normalizeProviderVolume", () => {
  it("withholds the provider's extended-hours zero", () => {
    // Yahoo returns volume 0 on every extended bar while still returning real
    // OHLC. Storing that zero would put a fabricated quantity in the volume
    // pane and in every VWAP denominator.
    expect(normalizeProviderVolume(0, "EXTENDED")).toBeNull();
  });

  it("keeps a regular-session zero, which is a real observation", () => {
    expect(normalizeProviderVolume(0, "REGULAR")).toBe(0);
  });

  it("keeps a genuine extended-hours volume when the provider reports one", () => {
    expect(normalizeProviderVolume(12_500, "EXTENDED")).toBe(12_500);
  });

  it("maps absent and non-finite volumes to unknown, never to zero", () => {
    expect(normalizeProviderVolume(null, "REGULAR")).toBeNull();
    expect(normalizeProviderVolume(undefined, "REGULAR")).toBeNull();
    expect(normalizeProviderVolume(Number.NaN, "REGULAR")).toBeNull();
    expect(normalizeProviderVolume(-1, "REGULAR")).toBeNull();
  });
});

/* ──────────────────────────── provider windows ──────────────────────────── */

describe("intervalReachableAt", () => {
  const now = new Date("2026-08-20T12:00:00.000Z");
  const daysAgo = (n: number) =>
    new Date(now.getTime() - n * 86_400_000);

  it("matches the measured lookback limits", () => {
    expect(INTERVAL_LOOKBACK_DAYS["ONE_MINUTE"]).toBe(30);
    expect(INTERVAL_LOOKBACK_DAYS["FIVE_MINUTE"]).toBe(60);
    expect(INTERVAL_LOOKBACK_DAYS["FIFTEEN_MINUTE"]).toBe(60);
    expect(INTERVAL_LOOKBACK_DAYS["THIRTY_MINUTE"]).toBe(60);
    expect(INTERVAL_LOOKBACK_DAYS["ONE_HOUR"]).toBe(730);
    expect(INTERVAL_LOOKBACK_DAYS["ONE_DAY"]).toBeNull();
  });

  it("admits an instant inside the window and rejects one outside it", () => {
    expect(intervalReachableAt("FIVE_MINUTE", daysAgo(59), now)).toBe(true);
    expect(intervalReachableAt("FIVE_MINUTE", daysAgo(61), now)).toBe(false);
    expect(intervalReachableAt("ONE_HOUR", daysAgo(729), now)).toBe(true);
    expect(intervalReachableAt("ONE_HOUR", daysAgo(731), now)).toBe(false);
  });

  it("treats daily as unbounded backwards but not into the future", () => {
    expect(intervalReachableAt("ONE_DAY", daysAgo(12_000), now)).toBe(true);
    expect(intervalReachableAt("ONE_DAY", daysAgo(-5), now)).toBe(false);
  });

  it("rejects a future instant at every intraday interval", () => {
    for (const interval of ["ONE_MINUTE", "FIVE_MINUTE", "FIFTEEN_MINUTE", "ONE_HOUR"] as CandleInterval[]) {
      expect(intervalReachableAt(interval, daysAgo(-1), now)).toBe(false);
    }
  });

  it("reports the real coverage of the oldest and newest stored events", () => {
    // The library currently spans 2022-07-13 to 2025-07-03. Neither end can
    // reach 5m, which is the finding that blocks a 5-minute backfill today.
    const newest = new Date("2025-07-03T12:30:00.000Z");
    const oldest = new Date("2022-07-13T12:30:00.000Z");
    expect(intervalReachableAt("FIVE_MINUTE", newest, now)).toBe(false);
    expect(intervalReachableAt("ONE_HOUR", newest, now)).toBe(true);
    expect(intervalReachableAt("ONE_HOUR", oldest, now)).toBe(false);
    expect(intervalReachableAt("ONE_DAY", oldest, now)).toBe(true);
  });
});

describe("finestReachableInterval", () => {
  const now = new Date("2026-08-20T12:00:00.000Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  it("returns the finest interval the provider still serves", () => {
    expect(finestReachableInterval(daysAgo(10), now)).toBe("ONE_MINUTE");
    expect(finestReachableInterval(daysAgo(45), now)).toBe("FIVE_MINUTE");
    expect(finestReachableInterval(daysAgo(400), now)).toBe("ONE_HOUR");
    expect(finestReachableInterval(daysAgo(1500), now)).toBe("ONE_DAY");
  });

  it("never claims an interval finer than the window allows", () => {
    // Guards against the tempting substitution of "close enough" granularity.
    expect(finestReachableInterval(daysAgo(61), now)).not.toBe("FIVE_MINUTE");
  });
});

/* ──────────────────────────── row estimation ────────────────────────────── */

describe("barsPerSession", () => {
  it("uses the 6.5-hour regular session", () => {
    expect(REGULAR_SESSION_MINUTES).toBe(390);
    expect(barsPerSession("FIVE_MINUTE", false)).toBe(78);
    expect(barsPerSession("ONE_HOUR", false)).toBe(7);
  });

  it("uses the 16-hour extended session Yahoo actually returns", () => {
    expect(EXTENDED_SESSION_MINUTES).toBe(960);
    expect(barsPerSession("FIVE_MINUTE", true)).toBe(192);
    expect(barsPerSession("ONE_HOUR", true)).toBe(16);
  });

  it("counts a daily bar once regardless of session flag", () => {
    expect(barsPerSession("ONE_DAY", true)).toBe(1);
    expect(barsPerSession("ONE_DAY", false)).toBe(1);
  });
});

describe("estimateCandleRows", () => {
  it("sizes the proposed proof-of-concept backfill", () => {
    // SPY only, 5-minute, three sessions per event, five events.
    expect(
      estimateCandleRows({
        interval: "FIVE_MINUTE",
        sessionsPerEvent: 3,
        events: 5,
        symbols: 1,
        includeExtended: true,
      }),
    ).toBe(2_880);
  });

  it("sizes the same shape at the only interval today's events can reach", () => {
    expect(
      estimateCandleRows({
        interval: "ONE_HOUR",
        sessionsPerEvent: 3,
        events: 5,
        symbols: 1,
        includeExtended: true,
      }),
    ).toBe(240);
  });

  it("scales linearly in events and symbols", () => {
    const one = estimateCandleRows({
      interval: "FIVE_MINUTE",
      sessionsPerEvent: 3,
      events: 1,
      symbols: 1,
      includeExtended: true,
    });
    const many = estimateCandleRows({
      interval: "FIVE_MINUTE",
      sessionsPerEvent: 3,
      events: 20,
      symbols: 12,
      includeExtended: true,
    });
    expect(many).toBe(one * 20 * 12);
  });

  it("is smaller when extended hours are excluded", () => {
    const withExtended = estimateCandleRows({
      interval: "FIVE_MINUTE",
      sessionsPerEvent: 3,
      events: 5,
      symbols: 1,
      includeExtended: true,
    });
    const regularOnly = estimateCandleRows({
      interval: "FIVE_MINUTE",
      sessionsPerEvent: 3,
      events: 5,
      symbols: 1,
      includeExtended: false,
    });
    expect(regularOnly).toBeLessThan(withExtended);
  });
});
