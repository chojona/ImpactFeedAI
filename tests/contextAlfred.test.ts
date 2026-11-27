import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  assignReleaseStages,
  buildAlfredObservationsUrl,
  fetchAlfredObservations,
  parseAlfredObservationsPayload,
  redactFredUrl,
  refuseSilentCurrentFallback,
} from "@/services/context/alfred";
import {
  ALFRED_FULL_REALTIME_END,
  ALFRED_FULL_REALTIME_START,
  CONTEXT_SERIES,
} from "@/services/context/definitions";

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/alfred",
);

const load = (name: string): string =>
  readFileSync(join(fixtureDir, name), "utf8");

describe("ALFRED adapter requests", () => {
  it("builds revision_history with full realtime span and output_type=1", () => {
    const url = new URL(
      buildAlfredObservationsUrl(
        {
          seriesId: "PAYEMS",
          observationStart: "2023-01-01",
          observationEnd: "2023-01-01",
          mode: "revision_history",
        },
        "test-key",
      ),
    );
    expect(url.searchParams.get("realtime_start")).toBe(
      ALFRED_FULL_REALTIME_START,
    );
    expect(url.searchParams.get("realtime_end")).toBe(ALFRED_FULL_REALTIME_END);
    expect(url.searchParams.get("output_type")).toBe("1");
  });

  it("builds initial_release_only with output_type=4 and full realtime", () => {
    const url = new URL(
      buildAlfredObservationsUrl(
        {
          seriesId: "PAYEMS",
          observationStart: "2023-01-01",
          observationEnd: "2023-01-01",
          mode: "initial_release_only",
        },
        "test-key",
      ),
    );
    expect(url.searchParams.get("output_type")).toBe("4");
    expect(url.searchParams.get("realtime_start")).toBe(
      ALFRED_FULL_REALTIME_START,
    );
  });

  it("builds as_of_vintage with equal realtime bounds", () => {
    const url = new URL(
      buildAlfredObservationsUrl(
        {
          seriesId: "PAYEMS",
          observationStart: "2022-12-01",
          observationEnd: "2023-01-01",
          mode: "as_of_vintage",
          vintageDate: "2023-02-03",
        },
        "test-key",
      ),
    );
    expect(url.searchParams.get("realtime_start")).toBe("2023-02-03");
    expect(url.searchParams.get("realtime_end")).toBe("2023-02-03");
    expect(url.searchParams.get("output_type")).toBeNull();
  });

  it("redacts the API key from transport error detail", async () => {
    const result = await fetchAlfredObservations({
      request: {
        seriesId: "PAYEMS",
        observationStart: "2023-01-01",
        observationEnd: "2023-01-01",
        mode: "current_latest",
      },
      apiKey: "secret-api-key",
      httpGet: async (url) => {
        throw new Error(`request to ${url} failed`);
      },
    });
    expect(result.status).toBe("error");
    expect(JSON.stringify(result)).not.toContain("secret-api-key");
    expect(result.detail).toContain("[REDACTED]");
  });

  it("redacts api_key from evidence URLs", () => {
    const raw = buildAlfredObservationsUrl(
      {
        seriesId: "PAYEMS",
        observationStart: "2023-01-01",
        observationEnd: "2023-01-01",
        mode: "current_latest",
      },
      "secret-api-key",
    );
    expect(raw).toContain("secret-api-key");
    const redacted = redactFredUrl(raw);
    expect(redacted).not.toContain("secret-api-key");
    expect(redacted).not.toContain("api_key=");
  });

  it("refuses silent current-vintage fallback", () => {
    expect(() => refuseSilentCurrentFallback("empty vintage")).toThrow(
      /Refusing silent current-vintage fallback/,
    );
  });
});

describe("ALFRED parsing fixtures (verified 2026-11-27)", () => {
  const fetchedAt = new Date("2026-11-27T15:00:00.000Z");

  it("A1: initial PAYEMS Jan 2023 is 155073 on 2023-02-03", () => {
    const obs = parseAlfredObservationsPayload(
      load("payems-initial-jan2023.json"),
      {
        seriesId: "PAYEMS",
        mode: "initial_release_only",
        fetchedAt,
        sourceUrlRedacted: "https://api.stlouisfed.org/fred/series/observations",
        seriesKey: CONTEXT_SERIES.PAYEMS.seriesKey,
        unit: CONTEXT_SERIES.PAYEMS.unit,
      },
    );
    expect(obs).toHaveLength(1);
    expect(obs[0].value).toBe(155073);
    expect(obs[0].realtimeStart).toBe("2023-02-03");
    expect(obs[0].valueKind).toBe("INITIAL_REPORTED");
    expect(obs[0].releaseStage).toBe("INITIAL");
    expect(obs[0].publishedAt).toBeNull();
    expect(obs[0].quality).toBe("conservative_date_bound");
  });

  it("A4: empty as-of day before release stays missing", async () => {
    const result = await fetchAlfredObservations({
      request: {
        seriesId: "PAYEMS",
        observationStart: "2023-01-01",
        observationEnd: "2023-01-01",
        mode: "as_of_vintage",
        vintageDate: "2023-02-02",
      },
      apiKey: "test-key",
      now: fetchedAt,
      httpGet: async () => ({
        ok: true,
        status: 200,
        text: async () => load("payems-asof-2023-02-02-empty.json"),
      }),
    });
    expect(result.status).toBe("missing");
    expect(result.observations).toEqual([]);
  });

  it("A5: CPIAUCNS June 2022 initial index is 296.311 without invented instant", () => {
    const obs = parseAlfredObservationsPayload(
      load("cpiaucns-june2022-initial.json"),
      {
        seriesId: "CPIAUCNS",
        mode: "initial_release_only",
        fetchedAt,
        sourceUrlRedacted: "https://api.stlouisfed.org/fred/series/observations",
        seriesKey: CONTEXT_SERIES.CPIAUCNS.seriesKey,
        unit: CONTEXT_SERIES.CPIAUCNS.unit,
      },
    );
    expect(obs[0].value).toBe(296.311);
    expect(obs[0].publicationDate).toBe("2022-07-13");
    expect(obs[0].publishedAt).toBeNull();
    expect(obs[0].publicationPrecision).toBe("date");
  });

  it("A7: output_type=4 without historical realtime is a caller error surface", () => {
    const url = new URL(
      buildAlfredObservationsUrl(
        {
          seriesId: "PAYEMS",
          observationStart: "2023-01-01",
          observationEnd: "2023-01-01",
          mode: "initial_release_only",
        },
        "k",
      ),
    );
    // Guardrail: we always attach the full span for initial_release_only.
    expect(url.searchParams.get("realtime_start")).toBe(
      ALFRED_FULL_REALTIME_START,
    );
  });

  it("A8: current_latest is explicitly revised_latest, never verified_vintage", () => {
    const obs = parseAlfredObservationsPayload(
      load("payems-current-jan2023-panel.json"),
      {
        seriesId: "PAYEMS",
        mode: "current_latest",
        fetchedAt,
        sourceUrlRedacted: "https://api.stlouisfed.org/fred/series/observations",
        seriesKey: CONTEXT_SERIES.PAYEMS.seriesKey,
        unit: CONTEXT_SERIES.PAYEMS.unit,
      },
    );
    expect(obs.every((o) => o.quality === "revised_latest")).toBe(true);
    expect(obs.every((o) => o.valueKind === "CURRENT_DATABASE")).toBe(true);
    expect(obs.every((o) => o.publishedAt === null)).toBe(true);
  });

  it("assigns INITIAL then REVISION stages across revision history", () => {
    const payload = JSON.parse(
      load("payems-jan2023-revision-history.json"),
    ) as { observations: Array<{ date: string; realtime_start: string; realtime_end: string; value: string }> };
    const stages = assignReleaseStages(payload.observations);
    expect(stages.get("2023-01-01|2023-02-03")).toBe("INITIAL");
    expect(stages.get("2023-01-01|2023-03-10")).toBe("REVISION");
  });

  it("propagates HTTP errors without inventing observations", async () => {
    const result = await fetchAlfredObservations({
      request: {
        seriesId: "PAYEMS",
        observationStart: "2023-01-01",
        observationEnd: "2023-01-01",
        mode: "as_of_vintage",
        vintageDate: "2023-02-03",
      },
      apiKey: "test-key",
      httpGet: async () => ({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error_code: 400,
            error_message: "No vintage dates exist",
          }),
      }),
    });
    expect(result.status).toBe("error");
    expect(result.observations).toEqual([]);
  });

  it("injects fetch and never calls network by default", async () => {
    const httpGet = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => load("payems-asof-2023-02-03.json"),
    }));
    const result = await fetchAlfredObservations({
      request: {
        seriesId: "PAYEMS",
        observationStart: "2022-11-01",
        observationEnd: "2023-01-01",
        mode: "as_of_vintage",
        vintageDate: "2023-02-03",
      },
      apiKey: "test-key",
      httpGet,
      seriesKey: CONTEXT_SERIES.PAYEMS.seriesKey,
      unit: CONTEXT_SERIES.PAYEMS.unit,
    });
    expect(httpGet).toHaveBeenCalledOnce();
    expect(result.status).toBe("ok");
    expect(result.observations).toHaveLength(3);
  });
});
