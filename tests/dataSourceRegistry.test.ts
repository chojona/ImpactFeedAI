import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BLS_SERIES_BINDINGS, FRED_SERIES_BINDINGS, metricByCanonicalName } from "@/services/macro/metrics";
import { validateRegistry } from "@/services/sources/audit";
import { DATA_SOURCE_REGISTRY, getProvider } from "@/services/sources/registry";

const ROOT = path.resolve(__dirname, "..");
const allSeries = DATA_SOURCE_REGISTRY.providers.flatMap((p) => p.series);
const allClaims = allSeries.flatMap((s) => s.coverage);

describe("DATA_SOURCE_REGISTRY integrity", () => {
  it("passes every validation rule", () => {
    expect(validateRegistry(DATA_SOURCE_REGISTRY)).toEqual([]);
  });

  it("covers every provider in the audit scope", () => {
    expect(DATA_SOURCE_REGISTRY.providers.map((p) => p.id).sort()).toEqual(
      [
        "alfred",
        "alpha_vantage",
        "atlanta_fed",
        "bea",
        "bls",
        "cboe",
        "cleveland_fed",
        "federal_reserve_board",
        "fred",
        "nq_archive",
        "philadelphia_fed",
        "sf_fed",
        "treasury",
        "yahoo",
      ].sort(),
    );
  });

  it("gives live-probed providers at least one TESTED claim and a validation date", () => {
    const advertisedOnly = new Set([
      "atlanta_fed",
      "bea",
      "federal_reserve_board",
      "philadelphia_fed",
    ]);
    for (const p of DATA_SOURCE_REGISTRY.providers) {
      if (advertisedOnly.has(p.id)) {
        expect(p.series.flatMap((s) => s.coverage).some((c) => c.status === "ADVERTISED"), p.id).toBe(
          true,
        );
        expect(p.lastSuccessfulValidation, p.id).toBeNull();
        continue;
      }
      expect(p.series.flatMap((s) => s.coverage).some((c) => c.status === "TESTED"), p.id).toBe(true);
      expect(p.lastSuccessfulValidation, p.id).not.toBeNull();
    }
  });

  it("marks PR #31 release-calendar adapters as MAIN", () => {
    for (const id of ["bls", "fred", "sf_fed"] as const) {
      const paths = getProvider(id)!.implementations.filter((i) =>
        i.path.includes("release-calendar/"),
      );
      expect(paths.length, id).toBeGreaterThan(0);
      for (const impl of paths) {
        expect(impl.status, `${id} ${impl.path}`).toBe("MAIN");
        expect(impl.pullRequest, `${id} ${impl.path}`).toBeUndefined();
      }
    }
  });

  it("records licensing permissions from the 2026-11-27 audit", () => {
    expect(getProvider("yahoo")!.licensing).toMatchObject({
      storage: "RESTRICTED",
      redistribution: "PROHIBITED",
      basis: "DOCUMENTED",
    });
    expect(getProvider("cboe")!.licensing).toMatchObject({
      storage: "RESTRICTED",
      redistribution: "RESTRICTED",
      basis: "DOCUMENTED",
    });
    expect(getProvider("nq_archive")!.licensing).toMatchObject({
      storage: "UNVERIFIED",
      redistribution: "RESTRICTED",
      basis: "DOCUMENTED",
    });
    expect(getProvider("fred")!.licensing.termsUrl).toBe("https://fred.stlouisfed.org/legal/");
    expect(getProvider("fred")!.licensing.summary).toMatch(/Property Rights and Licenses/);
    expect(getProvider("fred")!.licensing.summary).toMatch(/docs\/api\/terms_of_use\.html/);
    expect(getProvider("alfred")!.licensing.termsUrl).toBe("https://fred.stlouisfed.org/legal/");
    expect(getProvider("alpha_vantage")!.licensing.basis).toBe("UNVERIFIED");
    expect(getProvider("bea")!.licensing).toMatchObject({
      storage: "UNVERIFIED",
      redistribution: "UNVERIFIED",
      basis: "UNVERIFIED",
    });
    expect(getProvider("philadelphia_fed")!.licensing).toMatchObject({
      attributionRequired: false,
      termsUrl: "https://www.philadelphiafed.org/about-us/privacy-notice",
      basis: "DOCUMENTED",
    });
    expect(getProvider("atlanta_fed")!.licensing).toMatchObject({
      storage: "UNVERIFIED",
      redistribution: "RESTRICTED",
      basis: "DOCUMENTED",
    });
  });

  it("uses all three coverage states", () => {
    const statuses = new Set(allClaims.map((c) => c.status));
    expect([...statuses].sort()).toEqual(["ADVERTISED", "TESTED", "UNAVAILABLE"]);
  });

  it("points MAIN implementations at files that exist, and OPEN_PR ones at a PR number", () => {
    for (const p of DATA_SOURCE_REGISTRY.providers) {
      for (const impl of p.implementations) {
        if (impl.status === "MAIN") expect(existsSync(path.join(ROOT, impl.path)), impl.path).toBe(true);
        else expect(impl.pullRequest, `${p.id} ${impl.path}`).toBeGreaterThan(0);
      }
    }
  });

  it("describes every series the macro pipeline is bound to", () => {
    const ids = new Set(allSeries.map((s) => s.id));
    for (const b of FRED_SERIES_BINDINGS) expect(ids.has(`fred:${b.seriesId}`), b.seriesId).toBe(true);
    for (const b of BLS_SERIES_BINDINGS) expect(ids.has(`bls:${b.seriesId}`), b.seriesId).toBe(true);
  });

  it("only uses metric canonical keys that metricByCanonicalName resolves", () => {
    const metricKeys = allSeries.flatMap((s) => s.canonicalKeys).filter((k) => !k.startsWith("market:"));
    expect(metricKeys.length).toBeGreaterThan(0);
    for (const k of metricKeys) expect(metricByCanonicalName(k), k).not.toBeNull();
  });

  it("documents every API-key env var in .env.example", () => {
    const example = readFileSync(path.join(ROOT, ".env.example"), "utf8");
    for (const p of DATA_SOURCE_REGISTRY.providers.filter((x) => x.auth.kind === "api_key")) {
      for (const v of p.auth.envVars) expect(example, v).toMatch(new RegExp(`^${v}=`, "m"));
    }
  });

  it("never claims a non-zero cost or a premium tier as tested", () => {
    for (const p of DATA_SOURCE_REGISTRY.providers) expect(p.freeTier.costUsd).toBe(0);
    expect(allClaims.filter((c) => c.status === "TESTED" && c.accessTier === "premium")).toEqual([]);
  });
});

describe("recorded findings", () => {
  it("records Alpha Vantage intraday as premium-only on the free key", () => {
    const av = getProvider("alpha_vantage");
    const intraday = av!.series.flatMap((s) => s.coverage).filter((c) => ["1m", "5m", "60m"].includes(c.resolution));
    const freeKey = intraday.filter((c) => c.accessTier === "free_key");
    expect(freeKey.length).toBeGreaterThan(0);
    for (const c of freeKey) {
      expect(c.status).toBe("UNAVAILABLE");
      expect(c.unavailableReason).toBe("premium_only");
    }
  });

  it("marks current-vintage FRED macro series as point-in-time ineligible", () => {
    expect(getProvider("fred")!.series.find((s) => s.id === "fred:PAYEMS")!.pointInTime.status).toBe("INELIGIBLE");
  });

  it("keeps date-only ALFRED vintages CONDITIONAL on verified release timing", () => {
    for (const s of getProvider("alfred")!.series) {
      expect(s.publication.precision, s.id).toBe("date");
      expect(s.pointInTime.status, s.id).toBe("CONDITIONAL");
      expect(s.pointInTime.conditions.join(" "), s.id).toMatch(/verified .*release/i);
    }
  });

  it("marks nothing ELIGIBLE unless its publication time is instant-precision", () => {
    for (const s of allSeries.filter((x) => x.pointInTime.status === "ELIGIBLE")) {
      expect(s.publication.precision, s.id).toBe("instant");
    }
  });

  it("keeps the NQ schema gap out of the tested OHLCV series", () => {
    const nq = getProvider("nq_archive")!;
    const ohlcv = nq.series.find((s) => s.id === "nq_archive:nq_outright_ohlcv_1m")!;
    expect(ohlcv.coverage.map((c) => c.status)).toEqual(["TESTED"]);
    const gap = nq.series.find((s) => s.id === "nq_archive:nq_trades_mbo_status")!;
    expect(gap.coverage).toHaveLength(1);
    expect(gap.coverage[0]).toMatchObject({ status: "UNAVAILABLE", resolution: "tick", unavailableReason: "not_licensed" });
  });
});
