import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  MARKET_SERIES_CATALOG,
  MARKET_SERIES_KEYS,
  PRIORITY_SERIES_CATALOG_IDS,
  buildTreasuryYieldUrl,
  conservativeAvailableAtFromIsoDate,
  fetchCboeVixHistory,
  fetchFredMarketObservations,
  fetchTreasuryYieldCurve,
  observationAtFromIsoDate,
  parseRawNumeric,
  redactFredApiKey,
} from "@/services/market-context";

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/market-context",
);

const fixture = (name: string): string =>
  readFileSync(join(fixtureDir, name), "utf8");

const FIXED_FETCHED_AT = new Date("2024-01-10T15:00:00.000Z");

describe("market-context series registry", () => {
  it("covers every priority catalog id exactly once", () => {
    const ids = MARKET_SERIES_CATALOG.map((s) => s.catalogId).sort();
    expect(ids).toEqual([...PRIORITY_SERIES_CATALOG_IDS].sort());
  });

  it("aligns VIX/DGS2/DGS10 keys with Agent 06 regime contracts", () => {
    expect(MARKET_SERIES_KEYS.VIXCLS).toBe("market:VIXCLS:level");
    expect(MARKET_SERIES_KEYS.DGS2).toBe("market:DGS2:yield_pct");
    expect(MARKET_SERIES_KEYS.DGS10).toBe("market:DGS10:yield_pct");
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
    expect(parseRawNumeric("not-a-number")).toEqual({
      value: null,
      rawValue: "not-a-number",
      parseStatus: "invalid",
    });
  });

  it("uses next-day UTC midnight as conservative availableAt (date precision)", () => {
    const observationAt = observationAtFromIsoDate("2024-01-02");
    const availableAt = conservativeAvailableAtFromIsoDate("2024-01-02");
    expect(observationAt?.toISOString()).toBe("2024-01-02T00:00:00.000Z");
    expect(availableAt?.toISOString()).toBe("2024-01-03T00:00:00.000Z");
  });
});

describe("FRED market adapter", () => {
  it("parses VIXCLS closes and preserves missing rows as null", async () => {
    const result = await fetchFredMarketObservations({
      apiKey: "test-key",
      seriesId: "VIXCLS",
      fixtureBody: fixture("fred-vixcls.json"),
      fetchedAt: FIXED_FETCHED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.observations).toHaveLength(4);
    const byDate = Object.fromEntries(
      result.observations.map((row) => [
        row.observation.observationDate,
        row,
      ]),
    );

    expect(byDate["2024-01-02"]?.observation.value).toBe(13.2);
    expect(byDate["2024-01-02"]?.observation.seriesKey).toBe(
      MARKET_SERIES_KEYS.VIXCLS,
    );
    expect(byDate["2024-01-02"]?.observation.unit).toBe("index_points");
    expect(byDate["2024-01-02"]?.retrieval.rawValue).toBe("13.20");
    expect(byDate["2024-01-02"]?.retrieval.availabilityPrecision).toBe("date");
    expect(byDate["2024-01-02"]?.observation.quality).toBe(
      "conservative_date_bound",
    );
    expect(byDate["2024-01-02"]?.observation.availableAt?.toISOString()).toBe(
      "2024-01-03T00:00:00.000Z",
    );

    expect(byDate["2024-01-04"]?.observation.value).toBeNull();
    expect(byDate["2024-01-04"]?.observation.quality).toBe("missing");
    expect(byDate["2024-01-04"]?.retrieval.parseStatus).toBe("missing");
    expect(byDate["2024-01-04"]?.retrieval.rawValue).toBe(".");
  });

  it("maps breakevens and Fed target upper bound with pct_level units", async () => {
    const breakeven = await fetchFredMarketObservations({
      apiKey: "test-key",
      seriesId: "T5YIE",
      fixtureBody: fixture("fred-t5yie.json"),
      fetchedAt: FIXED_FETCHED_AT,
    });
    const target = await fetchFredMarketObservations({
      apiKey: "test-key",
      seriesId: "DFEDTARU",
      fixtureBody: fixture("fred-dfedtaru.json"),
      fetchedAt: FIXED_FETCHED_AT,
    });

    expect(breakeven.ok && breakeven.observations[0]?.observation.seriesKey).toBe(
      MARKET_SERIES_KEYS.T5YIE,
    );
    expect(breakeven.ok && breakeven.observations[0]?.observation.unit).toBe(
      "pct_level",
    );
    expect(target.ok && target.observations[0]?.observation.seriesKey).toBe(
      MARKET_SERIES_KEYS.DFEDTARU,
    );
    expect(target.ok && target.observations[0]?.observation.value).toBe(5.5);
  });

  it("redacts API keys from provenance endpoints", () => {
    const redacted = redactFredApiKey(
      "https://api.stlouisfed.org/fred/series/observations?series_id=VIXCLS&api_key=SECRET&file_type=json",
    );
    expect(redacted).toContain("api_key=REDACTED");
    expect(redacted).not.toContain("SECRET");
  });

  it("surfaces injected-fetch HTTP errors without inventing observations", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 503 }));
    const result = await fetchFredMarketObservations({
      apiKey: "test-key",
      seriesId: "DGS2",
      fetchImpl,
      fetchedAt: FIXED_FETCHED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("http_error");
    expect(result.error.statusCode).toBe(503);
    expect(result.error.sourceEndpoint).toContain("api_key=REDACTED");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("requires an API key when no fixture is provided", async () => {
    const result = await fetchFredMarketObservations({
      apiKey: "",
      seriesId: "DGS2",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("config_error");
  });
});

describe("Cboe VIX adapter", () => {
  it("parses CLOSE values onto the shared VIXCLS series key", async () => {
    const result = await fetchCboeVixHistory({
      fixtureBody: fixture("cboe-vix.csv"),
      fetchedAt: FIXED_FETCHED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.retrievalBatch.sourceProvider).toBe("cboe");
    expect(result.observations).toHaveLength(4);

    const first = result.observations[0]!;
    expect(first.observation.seriesKey).toBe(MARKET_SERIES_KEYS.VIXCLS);
    expect(first.observation.observationDate).toBe("2024-01-02");
    expect(first.observation.value).toBe(13.2);
    expect(first.observation.unit).toBe("index_points");
    expect(first.retrieval.rawValue).toBe("13.200000");
    expect(first.retrieval.availabilityPrecision).toBe("date");
    expect(first.observation.availableAt?.toISOString()).toBe(
      "2024-01-03T00:00:00.000Z",
    );

    const missing = result.observations.find(
      (row) => row.observation.observationDate === "2024-01-04",
    );
    expect(missing?.observation.value).toBeNull();
    expect(missing?.observation.quality).toBe("missing");
  });

  it("honours observationStart/End filters", async () => {
    const result = await fetchCboeVixHistory({
      fixtureBody: fixture("cboe-vix.csv"),
      fetchedAt: FIXED_FETCHED_AT,
      observationStart: "2024-01-03",
      observationEnd: "2024-01-04",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.observations.map((r) => r.observation.observationDate),
    ).toEqual(["2024-01-03", "2024-01-04"]);
  });

  it("returns http_error from injected fetch failures", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    const result = await fetchCboeVixHistory({ fetchImpl });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("http_error");
    expect(result.error.message).toContain("offline");
  });
});

describe("US Treasury yield adapter", () => {
  it("builds year and month endpoints", () => {
    expect(buildTreasuryYieldUrl({ year: 2024 })).toContain(
      "field_tdr_date_value=2024",
    );
    expect(buildTreasuryYieldUrl({ yearMonth: "202401" })).toContain(
      "field_tdr_date_value_month=202401",
    );
    expect(buildTreasuryYieldUrl({ allPages: true, page: 2 })).toContain(
      "page=2",
    );
  });

  it("parses BC_3MONTH / BC_2YEAR / BC_10YEAR with shared DGS keys", async () => {
    const result = await fetchTreasuryYieldCurve({
      fixtureBody: fixture("treasury-yields.xml"),
      fetchedAt: FIXED_FETCHED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.retrievalBatch.sourceProvider).toBe("us_treasury");
    // 3 entries × 3 fields
    expect(result.observations).toHaveLength(9);

    const jan2_2y = result.observations.find(
      (row) =>
        row.observation.observationDate === "2024-01-02" &&
        row.observation.seriesKey === MARKET_SERIES_KEYS.DGS2,
    );
    expect(jan2_2y?.observation.value).toBe(4.33);
    expect(jan2_2y?.observation.unit).toBe("pct_level");
    expect(jan2_2y?.retrieval.rawValue).toBe("4.33");
    expect(jan2_2y?.retrieval.availabilityPrecision).toBe("date");

    const jan2_10y = result.observations.find(
      (row) =>
        row.observation.observationDate === "2024-01-02" &&
        row.observation.seriesKey === MARKET_SERIES_KEYS.DGS10,
    );
    expect(jan2_10y?.observation.value).toBe(3.95);

    const jan2_3m = result.observations.find(
      (row) =>
        row.observation.observationDate === "2024-01-02" &&
        row.observation.seriesKey === MARKET_SERIES_KEYS.DGS3MO,
    );
    expect(jan2_3m?.observation.value).toBe(5.46);

    const missing3m = result.observations.find(
      (row) =>
        row.observation.observationDate === "2024-01-04" &&
        row.observation.seriesKey === MARKET_SERIES_KEYS.DGS3MO,
    );
    expect(missing3m?.observation.value).toBeNull();
    expect(missing3m?.retrieval.parseStatus).toBe("missing");
  });

  it("fails closed when neither fixture nor period is provided", async () => {
    const result = await fetchTreasuryYieldCurve({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("config_error");
  });
});

describe("cross-adapter provenance", () => {
  it("keeps FRED DGS2 mirror keys identical to Treasury BC_2YEAR emissions", async () => {
    const treasury = await fetchTreasuryYieldCurve({
      fixtureBody: fixture("treasury-yields.xml"),
      fetchedAt: FIXED_FETCHED_AT,
      fields: ["BC_2YEAR"],
    });
    const fred = await fetchFredMarketObservations({
      apiKey: "test-key",
      seriesId: "DGS2",
      fixtureBody: fixture("fred-dgs2.json"),
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
    expect(t?.observation.unit).toBe(f?.observation.unit);
    expect(t?.observation.value).toBe(f?.observation.value);
    expect(t?.retrieval.sourceProvider).toBe("us_treasury");
    expect(f?.retrieval.sourceProvider).toBe("fred");
  });
});
