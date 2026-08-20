import { describe, expect, it, vi } from "vitest";

import {
  createYahooCandleProvider,
  type CandleFetchOutcome,
} from "../scripts/ingest/candle-provider";
import { rowsFromOutcome } from "../scripts/ingest/candle-rows";
import { CURRENT_CANDLE_INGESTION_VERSION } from "@/services/market/candles";

/**
 * The provider adapter is where every Yahoo quirk is supposed to stop. These
 * tests drive it through an injected chart function, so the whole contract —
 * reachability, basis rejection, volume withholding, session classification —
 * is exercised without a network call and without depending on what the market
 * happened to do on a given day.
 *
 * The failure mode being guarded against is not "the adapter throws". It is
 * "the adapter returns candles that look fine and are on the wrong basis".
 */

interface Bar {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

/** A bar at a given ET wall-clock hour on 2026-05-13 (EDT, UTC−4). */
const bar = (
  etHour: number,
  price: number,
  volume: number | null = 1_000_000,
): Bar => ({
  date: new Date(Date.UTC(2026, 4, 13, etHour + 4, 0, 0)),
  open: price,
  high: price + 0.5,
  low: price - 0.5,
  close: price + 0.25,
  volume,
});

/** A daily bar for the same session, at a chosen scale. */
const dailyBar = (price: number): Bar => ({
  date: new Date(Date.UTC(2026, 4, 13, 13, 30, 0)),
  open: price,
  high: price + 1,
  low: price - 1,
  close: price + 0.5,
  volume: 50_000_000,
});

interface FakeChartOptions {
  intraday: Bar[];
  daily: Bar[];
  failDaily?: boolean;
  failIntraday?: boolean;
}

function fakeChart({
  intraday,
  daily,
  failDaily = false,
  failIntraday = false,
}: FakeChartOptions) {
  return vi.fn(
    async (
      _symbol: string,
      options: { period1: Date; period2: Date; interval: string },
    ) => {
      if (options.interval === "1d") {
        if (failDaily) throw new Error("daily fetch exploded");
        return { quotes: daily };
      }
      if (failIntraday) throw new Error("intraday fetch exploded");
      return { quotes: intraday };
    },
  );
}

const providerWith = (options: FakeChartOptions) =>
  createYahooCandleProvider({ chart: fakeChart(options), version: "test" });

const requestAround = (releaseAt: Date) => ({
  symbol: "SPY",
  interval: "ONE_HOUR" as const,
  from: new Date(releaseAt.getTime() - 2 * 86_400_000),
  to: new Date(releaseAt.getTime() + 2 * 86_400_000),
});

/** A release instant recent enough to be inside the 730-day hourly window. */
const recentRelease = () => new Date(Date.now() - 30 * 86_400_000);

/* ─────────────────────────────── reachability ───────────────────────────── */

describe("provider reachability", () => {
  it("refuses a window older than the interval's rolling limit", async () => {
    const provider = providerWith({ intraday: [], daily: [] });
    const old = new Date(Date.now() - 900 * 86_400_000);
    const outcome = await provider.fetchCandles(requestAround(old));
    expect(outcome.status).toBe("unreachable");
  });

  it("does not silently fall back to a coarser interval", async () => {
    // The whole point: an unreachable 1h request must fail, not quietly return
    // daily bars that would then be stored under the ONE_HOUR label.
    const chart = fakeChart({ intraday: [], daily: [dailyBar(500)] });
    const provider = createYahooCandleProvider({ chart, version: "test" });
    const old = new Date(Date.now() - 900 * 86_400_000);
    const outcome = await provider.fetchCandles(requestAround(old));
    expect(outcome.status).toBe("unreachable");
    expect(chart).not.toHaveBeenCalled();
  });

  it("reports the interval it cannot serve at all", async () => {
    const provider = providerWith({ intraday: [], daily: [] });
    expect(provider.supports("ONE_HOUR")).toBe(true);
    expect(provider.supports("ONE_DAY")).toBe(true);
  });
});

/* ──────────────────────────── basis integrity ───────────────────────────── */

describe("basis integrity", () => {
  it("accepts a series whose intraday and daily quotes agree", async () => {
    const provider = providerWith({
      intraday: [bar(10, 500), bar(11, 501)],
      daily: [dailyBar(500)],
    });
    const outcome = await provider.fetchCandles(requestAround(recentRelease()));
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.priceBasis).toBe("AS_TRADED");
    expect(outcome.candles).toHaveLength(2);
  });

  it("rejects a 2:1 split mismatch and returns no candles", async () => {
    // Exactly the XLK/XLE shape: intraday as-traded at ~2x the split-adjusted
    // daily series.
    const provider = providerWith({
      intraday: [bar(10, 232.89), bar(11, 233.5)],
      daily: [dailyBar(115.71)],
    });
    const outcome = await provider.fetchCandles(requestAround(recentRelease()));
    expect(outcome.status).toBe("basis_rejected");
    if (outcome.status !== "basis_rejected") return;
    expect(outcome.ratio).toBeCloseTo(2.0127, 3);
    expect(outcome.reason).toContain("different price bases");
  });

  it("rejects a reverse-split mismatch as well", async () => {
    const provider = providerWith({
      intraday: [bar(10, 50)],
      daily: [dailyBar(100)],
    });
    const outcome = await provider.fetchCandles(requestAround(recentRelease()));
    expect(outcome.status).toBe("basis_rejected");
  });

  it("tolerates the pre-market versus regular-open gap on a split-free name", async () => {
    // SPY's 04:00 bar sits ~0.4% from the 09:30 daily open. That must not be
    // mistaken for a corporate action.
    const provider = providerWith({
      intraday: [bar(4, 588.22)],
      daily: [dailyBar(585.88)],
    });
    const outcome = await provider.fetchCandles(requestAround(recentRelease()));
    expect(outcome.status).toBe("ok");
  });

  it("refuses when no session overlaps, rather than assuming agreement", async () => {
    // Without a reference session there is no evidence of the basis, so the
    // adapter fails closed instead of trusting the benign case.
    const provider = providerWith({
      intraday: [bar(10, 500)],
      daily: [],
    });
    const outcome = await provider.fetchCandles(requestAround(recentRelease()));
    expect(outcome.status).toBe("basis_rejected");
    if (outcome.status !== "basis_rejected") return;
    expect(outcome.reason).toContain("cannot be verified");
  });

  it("refuses when the basis reference fetch fails", async () => {
    const provider = providerWith({
      intraday: [bar(10, 500)],
      daily: [dailyBar(500)],
      failDaily: true,
    });
    const outcome = await provider.fetchCandles(requestAround(recentRelease()));
    expect(outcome.status).toBe("provider_error");
    if (outcome.status !== "provider_error") return;
    expect(outcome.reason).toContain("basis reference fetch failed");
  });

  it("never rescales prices to reconcile a mismatch", async () => {
    const provider = providerWith({
      intraday: [bar(10, 232.89)],
      daily: [dailyBar(115.71)],
    });
    const outcome = await provider.fetchCandles(requestAround(recentRelease()));
    // No "ok" branch exists that could carry a repaired price.
    expect(outcome.status).not.toBe("ok");
  });
});

/* ───────────────────────── provider failure handling ────────────────────── */

describe("provider failure handling", () => {
  it("surfaces an intraday fetch failure without throwing", async () => {
    const provider = providerWith({
      intraday: [],
      daily: [dailyBar(500)],
      failIntraday: true,
    });
    const outcome = await provider.fetchCandles(requestAround(recentRelease()));
    expect(outcome.status).toBe("provider_error");
    if (outcome.status !== "provider_error") return;
    expect(outcome.reason).toContain("intraday fetch exploded");
  });

  it("reports an empty response distinctly from a failure", async () => {
    const provider = providerWith({ intraday: [], daily: [dailyBar(500)] });
    const outcome = await provider.fetchCandles(requestAround(recentRelease()));
    expect(outcome.status).toBe("empty");
  });

  it("drops a bar with a missing leg rather than patching it", async () => {
    const broken: Bar = {
      date: new Date(Date.UTC(2026, 4, 13, 15, 0, 0)),
      open: 500,
      high: null,
      low: 499,
      close: 500.5,
      volume: 1_000,
    };
    const provider = providerWith({
      intraday: [bar(10, 500), broken],
      daily: [dailyBar(500)],
    });
    const outcome = await provider.fetchCandles(requestAround(recentRelease()));
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.candles).toHaveLength(1);
  });

  it("reports empty when every bar was incomplete", async () => {
    const broken: Bar = {
      date: new Date(Date.UTC(2026, 4, 13, 15, 0, 0)),
      open: null,
      high: null,
      low: null,
      close: null,
      volume: null,
    };
    const provider = providerWith({
      intraday: [broken],
      daily: [dailyBar(500)],
    });
    const outcome = await provider.fetchCandles(requestAround(recentRelease()));
    expect(outcome.status).toBe("empty");
  });
});

/* ──────────────────── volume and session normalisation ──────────────────── */

describe("volume and session normalisation", () => {
  it("withholds the fabricated extended-hours zero and counts it", async () => {
    const provider = providerWith({
      // 04:00 ET pre-market with Yahoo's fake zero, 10:00 ET with real volume.
      intraday: [bar(4, 500, 0), bar(10, 501, 1_234_567)],
      daily: [dailyBar(500)],
    });
    const outcome = await provider.fetchCandles(requestAround(recentRelease()));
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;

    const premarket = outcome.candles.find((c) => c.session === "EXTENDED");
    const regular = outcome.candles.find((c) => c.session === "REGULAR");
    expect(premarket?.volume).toBeNull();
    expect(regular?.volume).toBe(1_234_567);
    expect(outcome.volumeWithheld).toBe(1);
  });

  it("keeps a regular-session zero, which is a real observation", async () => {
    const provider = providerWith({
      intraday: [bar(10, 500, 0)],
      daily: [dailyBar(500)],
    });
    const outcome = await provider.fetchCandles(requestAround(recentRelease()));
    if (outcome.status !== "ok") throw new Error("expected ok");
    expect(outcome.candles[0].session).toBe("REGULAR");
    expect(outcome.candles[0].volume).toBe(0);
    expect(outcome.volumeWithheld).toBe(0);
  });

  it("classifies bars by New York wall clock, not UTC", async () => {
    const provider = providerWith({
      // 04:00, 09:30-equivalent (10:00) and 17:00 ET.
      intraday: [bar(4, 500), bar(10, 500), bar(17, 500)],
      daily: [dailyBar(500)],
    });
    const outcome = await provider.fetchCandles(requestAround(recentRelease()));
    if (outcome.status !== "ok") throw new Error("expected ok");
    expect(outcome.candles.map((c) => c.session)).toEqual([
      "EXTENDED",
      "REGULAR",
      "EXTENDED",
    ]);
  });

  it("never reports a split factor it did not receive", async () => {
    const provider = providerWith({
      intraday: [bar(10, 500)],
      daily: [dailyBar(500)],
    });
    const outcome = await provider.fetchCandles(requestAround(recentRelease()));
    if (outcome.status !== "ok") throw new Error("expected ok");
    // Null means undisclosed, which is not the same claim as "no split".
    expect(outcome.adjustmentFactor).toBeNull();
  });
});

/* ───────────────────────────── row construction ─────────────────────────── */

describe("rowsFromOutcome", () => {
  const okOutcome = (
    candles: Extract<CandleFetchOutcome, { status: "ok" }>["candles"],
  ): Extract<CandleFetchOutcome, { status: "ok" }> => ({
    status: "ok",
    candles,
    priceBasis: "AS_TRADED",
    adjustmentFactor: null,
    volumeWithheld: 0,
  });

  const good = {
    openTime: new Date("2026-05-13T14:00:00.000Z"),
    open: 500,
    high: 501,
    low: 499,
    close: 500.5,
    volume: 1_000,
    session: "REGULAR" as const,
  };

  it("stamps every row with the current ingestion version and basis", () => {
    const { rows } = rowsFromOutcome(
      okOutcome([good]),
      "SPY",
      "ONE_HOUR",
      "yahoo-finance2@test",
      new Date("2026-08-20T00:00:00.000Z"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].ingestionVersion).toBe(CURRENT_CANDLE_INGESTION_VERSION);
    expect(rows[0].priceBasis).toBe("AS_TRADED");
    expect(rows[0].provider).toBe("yahoo-finance2@test");
    expect(rows[0].session).toBe("REGULAR");
  });

  it("drops an incoherent bar instead of clamping it into shape", () => {
    const { rows, malformed } = rowsFromOutcome(
      okOutcome([good, { ...good, high: 498 }]),
      "SPY",
      "ONE_HOUR",
      "p",
      new Date(),
    );
    expect(rows).toHaveLength(1);
    expect(malformed).toBe(1);
  });

  it("preserves a null volume rather than defaulting it to zero", () => {
    const { rows } = rowsFromOutcome(
      okOutcome([{ ...good, volume: null, session: "EXTENDED" }]),
      "SPY",
      "ONE_HOUR",
      "p",
      new Date(),
    );
    expect(rows[0].volume).toBeNull();
  });
});
