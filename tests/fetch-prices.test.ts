import { describe, expect, it } from "vitest";

import { buildAssetReaction } from "../scripts/ingest/compute-reactions";
import {
  INTRADAY_BASELINE_MAX_AGE_MS,
  PRIOR_SESSION_BASELINE_MAX_AGE_MS,
  resolvePriceSnapshot,
  type Candle,
} from "../scripts/ingest/fetch-prices";
import { CURRENT_REACTION_CALCULATION_VERSION } from "@/services/events/timing";

/**
 * Daily Yahoo bars carry a provider timestamp at the session open. `close` is
 * separate because calculation v2 uses it only for the prior-session fallback.
 */
const dailyBar = (
  day: string,
  open: number | null,
  close: number | null = open,
  stampUtc = "13:30",
): Candle => {
  const clock = /^\d{2}:\d{2}$/.test(stampUtc)
    ? `${stampUtc}:00`
    : stampUtc;
  return {
    date: new Date(`${day}T${clock}Z`),
    open,
    close,
  };
};

const hourlyBar = (
  iso: string,
  open: number | null,
  close: number | null = open,
): Candle => ({
  date: new Date(iso),
  open,
  close,
});

describe("resolvePriceSnapshot calculation v2", () => {
  it("never uses a first post-release candle as the baseline", () => {
    const releaseAt = new Date("2025-05-13T12:30:00Z"); // 08:30 EDT
    const intraday = [hourlyBar("2025-05-13T13:30:00Z", 583.2)];
    const daily = [
      dailyBar("2025-05-13", 583.2),
      dailyBar("2025-05-14", 587.81),
    ];

    expect(resolvePriceSnapshot(intraday, daily, releaseAt)).toBeNull();
  });

  it("includes the opening gap for an 08:30 EDT release", () => {
    // May 13, 2025: 08:30 ET = 12:30Z; the 09:30 EDT open = 13:30Z.
    const releaseAt = new Date("2025-05-13T12:30:00Z");
    const intraday = [
      // Yesterday's intraday bar is too old; the explicit daily-close fallback
      // must win even though this price is later than the daily bar timestamp.
      hourlyBar("2025-05-12T19:30:00Z", 581.5),
      hourlyBar("2025-05-13T13:30:00Z", 570),
    ];
    const daily = [
      dailyBar("2025-05-12", 580, 582),
      dailyBar("2025-05-13", 570, 573),
      dailyBar("2025-05-14", 575, 576),
      dailyBar("2025-05-20", 578, 579),
    ];

    const snapshot = resolvePriceSnapshot(intraday, daily, releaseAt);

    expect(snapshot).toMatchObject({
      priceAtEvent: 582,
      anchorAt: new Date("2025-05-12T13:30:00Z"),
      price1h: 570,
      price1d: 575,
      price1w: 578,
    });
    expect(snapshot!.anchorAt.getTime()).toBeLessThan(releaseAt.getTime());
    expect(buildAssetReaction("SPY", snapshot!).pctChange1h).toBeLessThan(0);
  });

  it("uses a recent pre-release open for a 10:00 EST release", () => {
    // January 15, 2025: 10:00 ET = 15:00Z; market open = 14:30Z.
    const releaseAt = new Date("2025-01-15T15:00:00Z");
    const intraday = [
      // Deliberately unordered: provider ordering must not affect the result.
      hourlyBar("2025-01-15T16:30:00Z", 96),
      hourlyBar("2025-01-15T14:30:00Z", 100),
      hourlyBar("2025-01-15T15:30:00Z", 95),
    ];
    const daily = [
      dailyBar("2025-01-14", 99, 100, "14:30"),
      dailyBar("2025-01-15", 100, 95, "14:30"),
      dailyBar("2025-01-16", 97, 98, "14:30"),
      dailyBar("2025-01-22", 99, 99, "14:30"),
    ];

    const snapshot = resolvePriceSnapshot(intraday, daily, releaseAt);

    expect(snapshot).toMatchObject({
      priceAtEvent: 100,
      anchorAt: new Date("2025-01-15T14:30:00Z"),
      // +1h target is 16:00Z; the first hourly open after it is 16:30Z.
      price1h: 96,
      price1d: 97,
      price1w: 99,
    });
  });

  it("uses the last pre-statement bar for a 14:00 EDT FOMC release", () => {
    // June 18, 2025: 14:00 ET = 18:00Z.
    const releaseAt = new Date("2025-06-18T18:00:00Z");
    const intraday = [
      hourlyBar("2025-06-18T16:30:00Z", 599),
      hourlyBar("2025-06-18T17:30:00Z", 600),
      hourlyBar("2025-06-18T18:30:00Z", 580),
      hourlyBar("2025-06-18T19:30:00Z", 582),
    ];
    const daily = [
      dailyBar("2025-06-17", 598, 599),
      dailyBar("2025-06-18", 600, 581),
      dailyBar("2025-06-19", 584, 585),
      dailyBar("2025-06-25", 590, 591),
    ];

    const snapshot = resolvePriceSnapshot(intraday, daily, releaseAt);

    expect(snapshot).toMatchObject({
      priceAtEvent: 600,
      anchorAt: new Date("2025-06-18T17:30:00Z"),
      price1h: 582,
      price1d: 584,
      price1w: 590,
    });
  });

  it("requires the baseline timestamp to be strictly before releaseAt", () => {
    const releaseAt = new Date("2025-06-18T18:00:00Z");
    const atRelease = [
      hourlyBar("2025-06-18T18:00:00Z", 600),
      hourlyBar("2025-06-18T19:00:00Z", 590),
    ];
    expect(resolvePriceSnapshot(atRelease, [], releaseAt)).toBeNull();

    const withPrior = [
      hourlyBar("2025-06-18T17:59:59.999Z", 601),
      ...atRelease,
    ];
    expect(resolvePriceSnapshot(withPrior, [], releaseAt)!.anchorAt).toEqual(
      new Date("2025-06-18T17:59:59.999Z"),
    );
  });

  it("falls back to the prior close when intraday history is stale", () => {
    const releaseAt = new Date("2025-05-13T12:30:00Z");
    const intraday = [hourlyBar("2025-05-13T09:30:00Z", 999)];
    const daily = [
      dailyBar("2025-05-12", 90, 100),
      dailyBar("2025-05-13", 101, 102),
      dailyBar("2025-05-14", 103, 104),
    ];

    const snapshot = resolvePriceSnapshot(intraday, daily, releaseAt);
    expect(snapshot!.priceAtEvent).toBe(100);
    expect(snapshot!.anchorAt).toEqual(new Date("2025-05-12T13:30:00Z"));
  });

  it("rejects a missing prior-session close instead of substituting its open", () => {
    const daily = [
      dailyBar("2025-05-09", 97, 99),
      dailyBar("2025-05-12", 100, null),
      dailyBar("2025-05-13", 101, 102),
    ];

    expect(
      resolvePriceSnapshot(
        [],
        daily,
        new Date("2025-05-13T12:30:00Z"),
      ),
    ).toBeNull();
  });

  it("rejects stale intraday and daily baselines", () => {
    const releaseAt = new Date("2025-05-13T12:30:00Z");
    const staleIntraday = [
      hourlyBar(
        new Date(
          releaseAt.getTime() - INTRADAY_BASELINE_MAX_AGE_MS - 1,
        ).toISOString(),
        100,
      ),
    ];
    const staleDaily = [
      dailyBar(
        "2025-05-09",
        99,
        100,
        // 12:29:59.999Z makes the provider bar just over four days old.
        "12:29:59.999",
      ),
      dailyBar("2025-05-13", 101, 102),
    ];

    expect(resolvePriceSnapshot(staleIntraday, staleDaily, releaseAt)).toBeNull();
    expect(PRIOR_SESSION_BASELINE_MAX_AGE_MS).toBe(4 * 24 * 60 * 60 * 1000);
  });

  it("includes a weekend gap and measures sessions from the event", () => {
    // Saturday March 8 is EST (00:01 ET = 05:01Z); Monday March 10 is EDT,
    // so its regular-session open is 13:30Z rather than Friday's 14:30Z.
    const releaseAt = new Date("2025-03-08T05:01:00Z");
    const daily = [
      dailyBar("2025-03-07", 100, 101, "14:30"),
      dailyBar("2025-03-10", 95, 96),
      dailyBar("2025-03-11", 97, 98),
      dailyBar("2025-03-17", 96, 97),
    ];

    const snapshot = resolvePriceSnapshot([], daily, releaseAt);

    expect(snapshot).toMatchObject({
      priceAtEvent: 101,
      anchorAt: new Date("2025-03-07T14:30:00Z"),
      // Monday is the release session; one session later is Tuesday.
      price1d: 97,
      price1w: 96,
    });
    expect(buildAssetReaction("SPY", snapshot!).pctChange1d).not.toBe(0);
  });

  it("uses the release date's session for an after-hours event", () => {
    // 16:20 EDT = 20:20Z. The 15:30 EDT bar is a recent pre-release baseline;
    // the next session (Thursday) is still the one-day endpoint.
    const releaseAt = new Date("2025-05-28T20:20:00Z");
    const intraday = [
      hourlyBar("2025-05-28T19:30:00Z", 588.5),
      hourlyBar("2025-05-28T20:30:00Z", 590.09),
    ];
    const daily = [
      dailyBar("2025-05-27", 585, 587),
      dailyBar("2025-05-28", 588.5, 589),
      dailyBar("2025-05-29", 589.63, 590),
      dailyBar("2025-06-04", 597.63, 598),
    ];

    const snapshot = resolvePriceSnapshot(intraday, daily, releaseAt);
    expect(snapshot!.priceAtEvent).toBe(588.5);
    expect(snapshot!.price1d).toBe(589.63);
  });

  it("rejects a next-morning candle as a one-hour endpoint", () => {
    const releaseAt = new Date("2025-05-13T19:25:00Z");
    const intraday = [
      hourlyBar("2025-05-13T18:30:00Z", 583),
      hourlyBar("2025-05-14T13:30:00Z", 590),
    ];
    const daily = [
      dailyBar("2025-05-12", 580, 582),
      dailyBar("2025-05-13", 583, 584),
      dailyBar("2025-05-14", 590, 591),
    ];

    expect(resolvePriceSnapshot(intraday, daily, releaseAt)!.price1h).toBeNull();
  });

  it("tolerates one missing hourly endpoint bar within the bounded slip", () => {
    const releaseAt = new Date("2025-05-13T13:31:00Z");
    const intraday = [
      hourlyBar("2025-05-13T13:30:00Z", 583),
      // 14:30Z is before the 14:31Z target; 15:30Z remains within the slip.
      hourlyBar("2025-05-13T15:30:00Z", 585),
    ];

    expect(resolvePriceSnapshot(intraday, [], releaseAt)!.price1h).toBe(585);
  });

  it("skips unusable intraday opens without borrowing their close", () => {
    const releaseAt = new Date("2025-05-13T13:45:00Z");
    const intraday = [
      hourlyBar("2025-05-13T12:30:00Z", 581),
      // Its close may occur after the release, so it is not a safe substitute.
      hourlyBar("2025-05-13T13:30:00Z", null, 590),
      hourlyBar("2025-05-13T14:45:00Z", Number.POSITIVE_INFINITY),
      hourlyBar("2025-05-13T15:30:00Z", 585),
    ];

    const snapshot = resolvePriceSnapshot(intraday, [], releaseAt);
    expect(snapshot!.priceAtEvent).toBe(581);
    expect(snapshot!.anchorAt).toEqual(new Date("2025-05-13T12:30:00Z"));
    expect(snapshot!.price1h).toBe(585);
  });

  it("leaves the week endpoint null when the daily series does not reach it", () => {
    const daily = [
      dailyBar("2025-05-12", 580, 582),
      dailyBar("2025-05-13", 583, 584),
      dailyBar("2025-05-14", 587.81, 588),
    ];
    const snapshot = resolvePriceSnapshot(
      [],
      daily,
      new Date("2025-05-13T12:30:00Z"),
    );
    expect(snapshot!.price1d).toBe(587.81);
    expect(snapshot!.price1w).toBeNull();
  });

  it("returns null for an invalid release instant", () => {
    expect(resolvePriceSnapshot([], [], new Date(Number.NaN))).toBeNull();
  });
});

describe("buildAssetReaction", () => {
  const snapshot = {
    priceAtEvent: 100,
    anchorAt: new Date("2025-05-13T13:00:00Z"),
    price1h: 101,
    price1d: 95.5,
    price1w: null,
  };

  it("computes percent change from the pre-release baseline", () => {
    const row = buildAssetReaction("SPY", snapshot);
    expect(row.pctChange1h).toBe(1);
    expect(row.pctChange1d).toBe(-4.5);
  });

  it("returns null — never zero — for an unmeasured window", () => {
    expect(buildAssetReaction("SPY", snapshot).pctChange1w).toBeNull();
  });

  it("does not divide by a zero baseline", () => {
    const row = buildAssetReaction("SPY", {
      ...snapshot,
      priceAtEvent: 0,
    });
    expect(row.pctChange1h).toBeNull();
    expect(row.pctChange1d).toBeNull();
  });

  it("rejects non-finite provider values", () => {
    const row = buildAssetReaction("SPY", {
      ...snapshot,
      price1h: Number.POSITIVE_INFINITY,
    });
    expect(row.pctChange1h).toBeNull();
  });

  it("persists the baseline bar and calculation version 2", () => {
    const row = buildAssetReaction("SPY", snapshot);
    expect(row.anchorAt).toEqual(snapshot.anchorAt);
    expect(row.calculationVersion).toBe(
      CURRENT_REACTION_CALCULATION_VERSION,
    );
    expect(row.calculationVersion).toBe(2);
    expect(row.priceAtEvent).toBe(100);
    expect(row.price1h).toBe(101);
    expect(row.price1w).toBeNull();
  });
});
