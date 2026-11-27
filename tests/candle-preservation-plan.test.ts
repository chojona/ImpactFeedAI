import { describe, expect, it } from "vitest";

import {
  PRESERVATION_WINDOW_DAYS_EACH_SIDE,
  buildEventWindows,
  buildPreservationPlan,
  daysRemainingUntilLookbackCliff,
  eventWindowBounds,
  isWindowFullyCovered,
  minExpectedBarsForWindow,
  rankWindowsApproachingLoss,
} from "../scripts/ingest/candle-preservation-plan";
import { INTERVAL_LOOKBACK_DAYS } from "../scripts/ingest/candle-semantics";

const DAY_MS = 86_400_000;

describe("daysRemainingUntilLookbackCliff", () => {
  it("returns null for daily (no practical cliff)", () => {
    const now = new Date("2025-06-01T12:00:00.000Z");
    const releaseAt = new Date("2020-01-01T12:00:00.000Z");
    expect(daysRemainingUntilLookbackCliff("ONE_DAY", releaseAt, now)).toBeNull();
  });

  it("matches lookback minus age for hourly", () => {
    const now = new Date("2025-06-01T00:00:00.000Z");
    const releaseAt = new Date(now.getTime() - 700 * DAY_MS);
    const remaining = daysRemainingUntilLookbackCliff(
      "ONE_HOUR",
      releaseAt,
      now,
    );
    expect(remaining).not.toBeNull();
    expect(remaining!).toBeCloseTo(
      (INTERVAL_LOOKBACK_DAYS.ONE_HOUR as number) - 700,
      5,
    );
  });

  it("goes negative once past the cliff", () => {
    const now = new Date("2025-06-01T00:00:00.000Z");
    const releaseAt = new Date(now.getTime() - 800 * DAY_MS);
    const remaining = daysRemainingUntilLookbackCliff(
      "ONE_HOUR",
      releaseAt,
      now,
    );
    expect(remaining!).toBeLessThan(0);
  });
});

describe("rankWindowsApproachingLoss", () => {
  it("orders oldest-at-risk first and drops unreachable", () => {
    const now = new Date("2025-06-01T00:00:00.000Z");
    const events = [
      { id: "new", releaseAt: new Date(now.getTime() - 10 * DAY_MS) },
      { id: "old-risk", releaseAt: new Date(now.getTime() - 720 * DAY_MS) },
      { id: "gone", releaseAt: new Date(now.getTime() - 800 * DAY_MS) },
      { id: "mid", releaseAt: new Date(now.getTime() - 100 * DAY_MS) },
    ];
    const windows = buildEventWindows(events, "ONE_HOUR", now, 30);
    const ranked = rankWindowsApproachingLoss(windows);

    expect(ranked.map((w) => w.eventId)).toEqual(["old-risk", "mid", "new"]);
    expect(ranked[0]?.approachingLoss).toBe(true);
    expect(windows.find((w) => w.eventId === "gone")?.reachable).toBe(false);
  });
});

describe("incremental skip-when-covered", () => {
  it("skips units whose stored count meets the regular-session floor", () => {
    const now = new Date("2025-06-01T00:00:00.000Z");
    const releaseAt = new Date(now.getTime() - 30 * DAY_MS);
    const { from, to } = eventWindowBounds(releaseAt);
    const minExpected = minExpectedBarsForWindow("ONE_HOUR");

    expect(isWindowFullyCovered(minExpected, "ONE_HOUR")).toBe(true);
    expect(isWindowFullyCovered(minExpected - 1, "ONE_HOUR")).toBe(false);

    const coverage = new Map<string, number>([
      [`SPY|ONE_HOUR|${from.toISOString()}|${to.toISOString()}`, minExpected],
      [`QQQ|ONE_HOUR|${from.toISOString()}|${to.toISOString()}`, 0],
    ]);

    const plan = buildPreservationPlan({
      events: [{ id: "e1", releaseAt }],
      symbols: ["SPY", "QQQ"],
      interval: "ONE_HOUR",
      now,
      coverageFor: ({ symbol, interval, from: f, to: t }) => ({
        symbol,
        interval,
        storedCount:
          coverage.get(`${symbol}|${interval}|${f.toISOString()}|${t.toISOString()}`) ??
          0,
      }),
    });

    expect(plan.units).toHaveLength(2);
    expect(plan.skippedFullyCovered).toBe(1);
    expect(plan.remaining).toHaveLength(1);
    expect(plan.remaining[0]?.symbol).toBe("QQQ");
    expect(plan.remaining[0]?.estimatedRowsUpperBound).toBeGreaterThan(0);
  });

  it("re-planning with the same coverage yields the same remaining work", () => {
    const now = new Date("2025-06-01T00:00:00.000Z");
    const releaseAt = new Date(now.getTime() - 40 * DAY_MS);
    const input = {
      events: [{ id: "e1", releaseAt }],
      symbols: ["SPY"],
      interval: "ONE_HOUR" as const,
      now,
      coverageFor: () => ({
        symbol: "SPY",
        interval: "ONE_HOUR" as const,
        storedCount: 0,
      }),
    };

    const first = buildPreservationPlan(input);
    const second = buildPreservationPlan(input);

    expect(second.remaining).toEqual(first.remaining);
    expect(second.estimatedRowsUpperBound).toBe(first.estimatedRowsUpperBound);
  });

  it("uses the shared ± window width", () => {
    expect(PRESERVATION_WINDOW_DAYS_EACH_SIDE).toBe(2);
    const releaseAt = new Date("2025-01-15T13:30:00.000Z");
    const { from, to } = eventWindowBounds(releaseAt);
    expect(to.getTime() - from.getTime()).toBe(4 * DAY_MS);
  });
});
