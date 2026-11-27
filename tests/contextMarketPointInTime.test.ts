import { describe, expect, it } from "vitest";

import { MARKET_SERIES_KEYS } from "@/services/context/definitions";
import {
  isAvailableBeforeCutoff,
  isMarketObservationEligible,
  selectEligibleMarketObservations,
} from "@/services/context/pointInTime";
import type { MarketContextObservation } from "@/types/context";

function marketObs(
  partial: Partial<MarketContextObservation> &
    Pick<MarketContextObservation, "id" | "observationDate" | "value">,
): MarketContextObservation {
  return {
    seriesKey: MARKET_SERIES_KEYS.VIXCLS,
    unit: "index_points",
    observationAt: new Date(`${partial.observationDate}T21:00:00.000Z`),
    availableAt: new Date(`${partial.observationDate}T21:00:00.000Z`),
    quality: "conservative_date_bound",
    ...partial,
  };
}

describe("market point-in-time eligibility (PR #16 contract)", () => {
  const cutoff = new Date("2024-06-03T13:30:00.000Z");

  it("enforces availableAt < cutoff", () => {
    expect(
      isAvailableBeforeCutoff(new Date("2024-06-03T13:29:59.000Z"), cutoff),
    ).toBe(true);
    expect(isAvailableBeforeCutoff(cutoff, cutoff)).toBe(false);
  });

  it("excludes same-instant availability", () => {
    const obs = marketObs({
      id: "vix-1",
      observationDate: "2024-06-03",
      value: 14.2,
      availableAt: cutoff,
    });
    expect(isMarketObservationEligible(obs, cutoff)).toBe(false);
  });

  it("selects only the requested series before cutoff", () => {
    const rows = [
      marketObs({
        id: "vix-old",
        observationDate: "2024-06-01",
        value: 13,
        availableAt: new Date("2024-06-01T21:00:00.000Z"),
      }),
      marketObs({
        id: "vix-future",
        observationDate: "2024-06-04",
        value: 15,
        availableAt: new Date("2024-06-04T21:00:00.000Z"),
      }),
      marketObs({
        id: "dgs",
        seriesKey: MARKET_SERIES_KEYS.DGS10,
        unit: "pct_level",
        observationDate: "2024-06-01",
        value: 4.3,
        availableAt: new Date("2024-06-01T21:00:00.000Z"),
      }),
    ];
    const selected = selectEligibleMarketObservations(
      rows,
      MARKET_SERIES_KEYS.VIXCLS,
      cutoff,
    );
    expect(selected.map((r) => r.id)).toEqual(["vix-old"]);
  });
});
