import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { easternWallClock } from "@/services/macro/time";
import {
  AVAILABILITY_POLICY,
  MARKET_SERIES_CATALOG,
  MARKET_SERIES_KEYS,
  PRIORITY_SERIES_CATALOG_IDS,
  adapterObservationIneligibilityReasons,
  buildTreasuryYieldUrl,
  cboeVixAvailability,
  fetchCboeVixHistory,
  fetchFredMarketObservations,
  fetchTreasuryYieldCurve,
  isEligibleForHistoricalReconstruction,
  isEligibleForSystemReplay,
  nextNyMidnightAfter,
  parseRawNumeric,
  redactFredApiKey,
  redactFredText,
  sessionWindowIsComplete,
  treasuryH15Availability,
  validateSessionCalendar,
} from "@/services/market-context";

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/market-context",
);

const fixture = (name: string): string =>
  readFileSync(join(fixtureDir, name), "utf8");

const FIXED_FETCHED_AT = new Date("2024-06-01T15:00:00.000Z");

describe("market-context series registry", () => {
  it("covers every priority fetch catalog id", () => {
    const ids = new Set(MARKET_SERIES_CATALOG.map((s) => s.catalogId));
    for (const id of PRIORITY_SERIES_CATALOG_IDS) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("aligns VIX/DGS2/DGS10/SPY keys with Agent 06 regime contracts", () => {
    expect(MARKET_SERIES_KEYS.VIXCLS).toBe("market:VIXCLS:level");
    expect(MARKET_SERIES_KEYS.DGS2).toBe("market:DGS2:yield_pct");
    expect(MARKET_SERIES_KEYS.DGS10).toBe("market:DGS10:yield_pct");
    expect(MARKET_SERIES_KEYS.SPY).toBe("market:SPY:close");
  });
});

describe("availability helpers", () => {
  it("parses missing FRED dots as null, never 0", () => {
    expect(parseRawNumeric(".")).toEqual({
      value: null,
      rawValue: ".",
      parseStatus: "missing",
    });
    expect(parseRawNumeric("0")).toEqual({
      value: 0,
      rawValue: "0",
      parseStatus: "ok",
    });
  });

  it("uses NY next-day midnight for Cboe, not UTC midnight", () => {
    const bound = cboeVixAvailability("2024-01-02");
    expect(bound.availabilityPolicyVersion).toBe(
      AVAILABILITY_POLICY.CBOE_VIX_NY_NEXT_DAY_OPEN,
    );
    expect(bound.availableAt?.toISOString()).toBe(
      nextNyMidnightAfter("2024-01-02")?.toISOString(),
    );
    // UTC next-midnight would be 2024-01-03T00:00:00.000Z; NY midnight in
    // January is 05:00Z.
    expect(bound.availableAt?.toISOString()).toBe("2024-01-03T05:00:00.000Z");
    expect(bound.availableAt?.toISOString()).not.toBe(
      "2024-01-03T00:00:00.000Z",
    );
  });

  it("uses H.15 16:15 ET for Treasury yields", () => {
    const bound = treasuryH15Availability("2024-01-02");
    expect(bound.availabilityPolicyVersion).toBe(
      AVAILABILITY_POLICY.TREASURY_H15_1615_ET,
    );
    expect(bound.availabilityPrecision).toBe("timestamp");
    expect(bound.availableAt?.toISOString()).toBe(
      easternWallClock("2024-01-02", 16, 15).toISOString(),
    );
  });
});

describe("FRED market adapter — revision / vintage gating", () => {
  it("marks current-revised pulls as revised_latest and unsuitable for reconstruction", async () => {
    const result = await fetchFredMarketObservations({
      apiKey: "test-key",
      seriesId: "VIXCLS",
      fixtureBody: fixture("fred-vixcls.json"),
      fetchedAt: FIXED_FETCHED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const okRow = result.observations.find(
      (row) => row.observation.observationDate === "2024-01-02",
    );
    expect(okRow?.observation.quality).toBe("revised_latest");
    expect(okRow?.observation.availableAt).toBeNull();
    expect(okRow?.observation.fetchedAt?.toISOString()).toBe(
      FIXED_FETCHED_AT.toISOString(),
    );
    expect(okRow?.retrieval.historicalReconstruction).toBe(
      "ineligible_revised_latest",
    );
    expect(okRow?.retrieval.vintageAsOf).toBeNull();
    expect(isEligibleForHistoricalReconstruction(okRow!.observation)).toBe(
      false,
    );
    expect(
      adapterObservationIneligibilityReasons(
        okRow!.observation,
        new Date("2024-06-01T12:00:00.000Z"),
        "PUBLIC_INFORMATION_RECONSTRUCTION",
      ),
    ).toContain("revised_latest_ineligible");

    const missing = result.observations.find(
      (row) => row.observation.observationDate === "2024-01-04",
    );
    expect(missing?.observation.value).toBeNull();
    expect(missing?.observation.quality).toBe("missing");
    expect(missing?.retrieval.rawValue).toBe(".");
  });

  it("marks vintageAsOf pulls eligible with NY-EOD availability", async () => {
    const result = await fetchFredMarketObservations({
      apiKey: "test-key",
      seriesId: "DGS2",
      vintageAsOf: "2024-01-03",
      fixtureBody: fixture("fred-dgs2-vintage.json"),
      fetchedAt: FIXED_FETCHED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const row = result.observations[0]!;
    expect(row.observation.quality).toBe("conservative_date_bound");
    expect(row.retrieval.vintageAsOf).toBe("2024-01-03");
    expect(row.retrieval.availabilityPolicyVersion).toBe(
      AVAILABILITY_POLICY.FRED_VINTAGE_NY_EOD,
    );
    expect(row.observation.availableAt?.toISOString()).toBe(
      nextNyMidnightAfter("2024-01-03")?.toISOString(),
    );
    expect(row.retrieval.historicalReconstruction).toBe("eligible");
    expect(isEligibleForHistoricalReconstruction(row.observation)).toBe(true);
  });

  it("redacts API keys and surfaces injected-fetch errors", async () => {
    const stripped = redactFredApiKey(
      "https://api.stlouisfed.org/fred/series/observations?api_key=SECRET&series_id=DGS2",
    );
    expect(stripped).not.toContain("SECRET");
    expect(stripped).not.toContain("api_key");
    expect(stripped).toContain("series_id=DGS2");

    const fetchImpl = vi.fn(async () => new Response("nope", { status: 503 }));
    const result = await fetchFredMarketObservations({
      apiKey: "test-key",
      seriesId: "DGS2",
      fetchImpl,
      fetchedAt: FIXED_FETCHED_AT,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.statusCode).toBe(503);
  });
});

describe("FRED API key redaction (PR #20 credential standard)", () => {
  // Contains characters URLSearchParams percent-encodes, so the encoded
  // form that a transport echoes in a URL is exercised too.
  const API_KEY = "sk+live/0123456789abcdef=";
  const ENCODED_KEY = encodeURIComponent(API_KEY);

  function expectNoKey(value: unknown): void {
    const text = JSON.stringify(value);
    expect(text).not.toContain(API_KEY);
    expect(text).not.toContain(ENCODED_KEY);
  }

  async function fetchWith(fetchImpl: (url: string | URL) => Promise<Response>) {
    return fetchFredMarketObservations({
      apiKey: API_KEY,
      seriesId: "DGS2",
      fetchImpl,
      fetchedAt: FIXED_FETCHED_AT,
    });
  }

  it("redacts the key from network-failure messages that echo the URL", async () => {
    const result = await fetchWith(async (url) => {
      throw new TypeError(`fetch failed for ${String(url)} (key ${API_KEY})`);
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("http_error");
    expect(result.error.message).toContain("[REDACTED]");
    expect(result.error.sourceEndpoint).not.toContain("api_key");
    expectNoKey(result);
  });

  it("redacts the key from non-Error throw values", async () => {
    const result = await fetchWith(async (url) => {
      throw `socket hang up: ${String(url)}`;
    });
    expect(result.ok).toBe(false);
    expectNoKey(result);
  });

  it("redacts the key from response-body reading errors", async () => {
    const result = await fetchWith(async (url) => {
      const res = new Response("{}", { status: 200 });
      Object.defineProperty(res, "text", {
        value: async () => {
          throw new Error(`stream aborted reading ${String(url)}`);
        },
      });
      return res;
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("parse_error");
    expect(result.error.message).toContain("failed to read body");
    expectNoKey(result);
  });

  it("strips the key from HTTP-error endpoints", async () => {
    const result = await fetchWith(async () => new Response("nope", { status: 403 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.statusCode).toBe(403);
    expect(result.error.sourceEndpoint).not.toContain("api_key");
    expectNoKey(result);
  });

  it("redacts the key from JSON parse errors when the body echoes it", async () => {
    const result = await fetchWith(
      async (url) => new Response(`<html>bad request ${String(url)} ${API_KEY}</html>`),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("invalid FRED JSON");
    expectNoKey(result);
  });

  it("rethrows unexpected exceptions with a redacted message", async () => {
    const hostile = {
      get ok(): boolean {
        throw new Error(`unexpected ${API_KEY} / ${ENCODED_KEY}`);
      },
    } as unknown as Response;
    const thrown = await fetchWith(async () => hostile).then(
      () => null,
      (err: unknown) => err,
    );
    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain("[REDACTED]");
    expect(message).not.toContain(API_KEY);
    expect(message).not.toContain(ENCODED_KEY);
    expect((thrown as Error).cause).toBeUndefined();
  });

  it("keeps successful retrieval provenance credential-free", async () => {
    const result = await fetchWith(async () => new Response(fixture("fred-dgs2.json")));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.observations.length).toBeGreaterThan(0);
    expect(result.retrievalBatch.sourceEndpoint).not.toContain("api_key");
    expectNoKey(result);
  });

  it("scrubs echoed api_key values even without the configured key", () => {
    expect(redactFredText("GET /obs?api_key=abc123&series_id=X", undefined)).toBe(
      "GET /obs?api_key=[REDACTED]&series_id=X",
    );
    expect(redactFredApiKey("not a url ?api_key=abc123&series_id=X")).toBe(
      "not a url ?series_id=X",
    );
  });
});

describe("provider publication delays vs 08:30 ET cutoffs", () => {
  it("keeps same-day Treasury yields unavailable before H.15 at an 08:30 ET cutoff", async () => {
    const result = await fetchTreasuryYieldCurve({
      fixtureBody: fixture("treasury-yields.xml"),
      fetchedAt: FIXED_FETCHED_AT,
      fields: ["BC_2YEAR"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const jan2 = result.observations.find(
      (row) => row.observation.observationDate === "2024-01-02",
    )!;
    const cutoff0830 = easternWallClock("2024-01-02", 8, 30);

    expect(jan2.observation.availableAt?.toISOString()).toBe(
      easternWallClock("2024-01-02", 16, 15).toISOString(),
    );
    expect(
      adapterObservationIneligibilityReasons(
        jan2.observation,
        cutoff0830,
        "PUBLIC_INFORMATION_RECONSTRUCTION",
      ),
    ).toContain("not_available_before_cutoff");
    expect(isEligibleForHistoricalReconstruction(jan2.observation)).toBe(true);

    // After H.15 the same day, the print is eligible.
    const afterH15 = easternWallClock("2024-01-02", 16, 16);
    expect(
      adapterObservationIneligibilityReasons(
        jan2.observation,
        afterH15,
        "PUBLIC_INFORMATION_RECONSTRUCTION",
      ),
    ).toEqual([]);
  });

  it("keeps same-day Cboe VIX unavailable at 08:30 ET (next NY day open policy)", async () => {
    const result = await fetchCboeVixHistory({
      fixtureBody: fixture("cboe-vix.csv"),
      fetchedAt: FIXED_FETCHED_AT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const jan2 = result.observations.find(
      (row) => row.observation.observationDate === "2024-01-02",
    )!;
    const cutoff0830 = easternWallClock("2024-01-02", 8, 30);
    expect(
      adapterObservationIneligibilityReasons(
        jan2.observation,
        cutoff0830,
        "PUBLIC_INFORMATION_RECONSTRUCTION",
      ),
    ).toContain("not_available_before_cutoff");

    const nextOpen = easternWallClock("2024-01-03", 0, 1);
    expect(
      adapterObservationIneligibilityReasons(
        jan2.observation,
        nextOpen,
        "PUBLIC_INFORMATION_RECONSTRUCTION",
      ),
    ).toEqual([]);
  });
});

describe("SYSTEM_REPLAY fetchedAt enforcement", () => {
  it("requires observation.fetchedAt strictly before cutoff", async () => {
    const result = await fetchCboeVixHistory({
      fixtureBody: fixture("cboe-vix.csv"),
      fetchedAt: new Date("2024-01-10T12:00:00.000Z"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const obs = result.observations[0]!.observation;
    expect(obs.fetchedAt?.toISOString()).toBe("2024-01-10T12:00:00.000Z");

    expect(
      isEligibleForSystemReplay(obs, new Date("2024-01-10T12:00:00.001Z")),
    ).toBe(true);
    expect(
      isEligibleForSystemReplay(obs, new Date("2024-01-10T12:00:00.000Z")),
    ).toBe(false);
    expect(
      adapterObservationIneligibilityReasons(
        obs,
        new Date("2024-01-10T11:59:59.000Z"),
        "SYSTEM_REPLAY",
      ),
    ).toContain("not_known_to_system");

    const withoutFetch = { ...obs, fetchedAt: null };
    expect(
      adapterObservationIneligibilityReasons(
        withoutFetch,
        new Date("2024-06-01T00:00:00.000Z"),
        "SYSTEM_REPLAY",
      ),
    ).toContain("not_known_to_system");
  });
});

describe("sessionCalendar helpers (no gap compression)", () => {
  it("rejects non-ascending or duplicate calendars", () => {
    expect(validateSessionCalendar(["2024-01-03", "2024-01-02"]).ok).toBe(false);
    expect(validateSessionCalendar(["2024-01-02", "2024-01-02"]).ok).toBe(false);
    expect(validateSessionCalendar(["2024-01-02", "2024-01-03"]).ok).toBe(true);
  });

  it("does not treat missing sessions as complete when prints are absent", () => {
    const calendar = ["2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"];
    const observations = [
      {
        id: "1",
        seriesKey: MARKET_SERIES_KEYS.VIXCLS,
        value: 13,
        unit: "index_points" as const,
        observationAt: new Date("2024-01-02T00:00:00.000Z"),
        observationDate: "2024-01-02",
        availableAt: new Date("2024-01-03T05:00:00.000Z"),
        fetchedAt: FIXED_FETCHED_AT,
        quality: "conservative_date_bound" as const,
      },
      {
        id: "2",
        seriesKey: MARKET_SERIES_KEYS.VIXCLS,
        value: 14,
        unit: "index_points" as const,
        observationAt: new Date("2024-01-05T00:00:00.000Z"),
        observationDate: "2024-01-05",
        availableAt: new Date("2024-01-06T05:00:00.000Z"),
        fetchedAt: FIXED_FETCHED_AT,
        quality: "conservative_date_bound" as const,
      },
    ];
    // Calendar still has 01-03 and 01-04 with no prints — window incomplete.
    expect(
      sessionWindowIsComplete(
        observations,
        MARKET_SERIES_KEYS.VIXCLS,
        calendar,
        "2024-01-05",
        4,
      ),
    ).toBe(false);
  });
});

describe("Cboe / Treasury parse provenance", () => {
  it("parses Cboe CLOSE onto shared VIXCLS key with fetchedAt", async () => {
    const result = await fetchCboeVixHistory({
      fixtureBody: fixture("cboe-vix.csv"),
      fetchedAt: FIXED_FETCHED_AT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const first = result.observations[0]!;
    expect(first.observation.seriesKey).toBe(MARKET_SERIES_KEYS.VIXCLS);
    expect(first.observation.value).toBe(9001.05);
    expect(first.observation.fetchedAt?.toISOString()).toBe(
      FIXED_FETCHED_AT.toISOString(),
    );
    expect(first.retrieval.availabilityPolicyVersion).toBe(
      AVAILABILITY_POLICY.CBOE_VIX_NY_NEXT_DAY_OPEN,
    );
  });

  it("parses Treasury BC fields onto DGS keys", async () => {
    expect(buildTreasuryYieldUrl({ year: 2024 })).toContain(
      "field_tdr_date_value=2024",
    );
    const result = await fetchTreasuryYieldCurve({
      fixtureBody: fixture("treasury-yields.xml"),
      fetchedAt: FIXED_FETCHED_AT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.observations).toHaveLength(9);
    const jan2_2y = result.observations.find(
      (row) =>
        row.observation.observationDate === "2024-01-02" &&
        row.observation.seriesKey === MARKET_SERIES_KEYS.DGS2,
    );
    expect(jan2_2y?.observation.value).toBe(4.33);
    expect(jan2_2y?.observation.fetchedAt?.toISOString()).toBe(
      FIXED_FETCHED_AT.toISOString(),
    );
  });

  it("keeps FRED DGS2 mirror keys identical to Treasury BC_2YEAR emissions", async () => {
    const treasury = await fetchTreasuryYieldCurve({
      fixtureBody: fixture("treasury-yields.xml"),
      fetchedAt: FIXED_FETCHED_AT,
      fields: ["BC_2YEAR"],
    });
    const fred = await fetchFredMarketObservations({
      apiKey: "test-key",
      seriesId: "DGS2",
      vintageAsOf: "2024-01-03",
      fixtureBody: fixture("fred-dgs2-vintage.json"),
      fetchedAt: FIXED_FETCHED_AT,
    });
    expect(treasury.ok && fred.ok).toBe(true);
    if (!treasury.ok || !fred.ok) return;
    const t = treasury.observations.find(
      (row) => row.observation.observationDate === "2024-01-02",
    );
    const f = fred.observations.find(
      (row) => row.observation.observationDate === "2024-01-02",
    );
    expect(t?.observation.seriesKey).toBe(f?.observation.seriesKey);
    expect(t?.observation.value).toBe(f?.observation.value);
  });
});
