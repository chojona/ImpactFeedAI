import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
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
import { selectRevisionForPeriod } from "@/services/context/revisionSelect";
import gdpVintages from "./fixtures/alfred/gdpc1-q1-2023-vintages.json";

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
  const reviewedReference = {
    sourceUrl: "https://example.com/archived-release",
    payloadSha256: "a".repeat(64),
  };
  const sourceUrlRedacted = "https://api.stlouisfed.org/fred/series/observations";
  const fullRealtimeWindow = {
    realtime_start: ALFRED_FULL_REALTIME_START,
    realtime_end: ALFRED_FULL_REALTIME_END,
  };
  const initialReleasePayload = (file: string): string => {
    const { observations } = JSON.parse(load(file)) as { observations: unknown[] };
    return JSON.stringify({ ...fullRealtimeWindow, output_type: 4, observations });
  };

  it("does not relabel the June GDP snapshot as initial based on the requested mode", () => {
    const [, june] = parseAlfredObservationsPayload(
      JSON.stringify(gdpVintages["2023-06-29"]),
      { seriesId: "GDPC1", mode: "initial_release_only", fetchedAt, sourceUrlRedacted },
    );
    expect(june).toMatchObject({
      releaseStage: "UNKNOWN",
      valueKind: "UNRESOLVED",
      availableAt: null,
    });
  });

  it.each(["output_type", "realtime_start", "realtime_end"] as const)(
    "leaves an initial-release response without %s unresolved",
    (field) => {
      const observations = [gdpVintages["2023-04-27"].observations[1]];
      const response = { ...fullRealtimeWindow, output_type: 4, observations, [field]: undefined };
      const [row] = parseAlfredObservationsPayload(
        JSON.stringify(response),
        { seriesId: "GDPC1", mode: "initial_release_only", fetchedAt, sourceUrlRedacted },
      );
      expect(row).toMatchObject({ releaseStage: "UNKNOWN", valueKind: "UNRESOLVED" });
    },
  );

  it("leaves stage and availability unresolved when reviewed evidence contradicts the archive", () => {
    const first = gdpVintages["2023-04-27"].observations[1];
    const response = {
      ...fullRealtimeWindow,
      output_type: 1,
      offset: 0,
      count: 1,
      observations: [first],
    };
    const [row] = parseAlfredObservationsPayload(JSON.stringify(response), {
      seriesId: "GDPC1",
      mode: "revision_history",
      fetchedAt,
      sourceUrlRedacted,
      publicationEvidence: [{
        seriesId: "GDPC1",
        observationPeriodStart: first.date,
        publicationDate: first.realtime_start,
        value: Number(first.value),
        releaseStage: "REVISION",
        reference: reviewedReference,
      }],
    });
    expect(row).toMatchObject({
      releaseStage: "UNKNOWN",
      valueKind: "UNRESOLVED",
      availableAt: null,
      publicationEvidence: null,
    });
  });

  it.each([
    { outputType: 1, mode: "revision_history" },
    { outputType: 4, mode: "initial_release_only" },
  ] as const)("leaves a pre-archive GDP period unresolved in $mode", ({ outputType, mode }) => {
    // Synthetic archive timeline for a 1980 period with no first print in ALFRED.
    const archived = {
      ...gdpVintages["2023-04-27"].observations[1],
      date: "1980-01-01",
      realtime_start: "1991-12-04",
      realtime_end: "1992-01-29",
    };
    const later = { ...archived, realtime_start: "1992-01-30", realtime_end: "9999-12-31" };
    const observations = outputType === 1 ? [archived, later] : [archived];
    const parsed = parseAlfredObservationsPayload(JSON.stringify({
      ...fullRealtimeWindow,
      output_type: outputType,
      offset: 0,
      count: observations.length,
      observations,
    }), { seriesId: "GDPC1", mode, fetchedAt, sourceUrlRedacted });
    expect(parsed[0]).toMatchObject({ releaseStage: "UNKNOWN", valueKind: "UNRESOLVED" });
    if (outputType === 1) expect(parsed[1].releaseStage).toBe("REVISION");
  });

  it.each([
    ["VIXCLS", "2023-01-03", "2023-01-03", "INITIAL"],
    ["PAYEMS", "2023-01-01", "2023-01-31", "UNKNOWN"],
    ["PAYEMS", "2023-01-01", "2023-03-03", "INITIAL"],
    ["PAYEMS", "2023-01-01", "2023-03-04", "UNKNOWN"],
    ["GDPC1", "2023-01-01", "2023-05-15", "INITIAL"],
    ["GDPC1", "2023-01-01", "2023-05-16", "UNKNOWN"],
  ])("bounds %s publication for period %s and vintage %s", (seriesId, date, vintage, stage) => {
    const row = { date, realtime_start: vintage, realtime_end: "9999-12-31", value: "1" };
    const [parsed] = parseAlfredObservationsPayload(JSON.stringify({
      ...fullRealtimeWindow,
      output_type: 4,
      observations: [row],
    }), { seriesId, mode: "initial_release_only", fetchedAt, sourceUrlRedacted });
    expect(parsed.releaseStage).toBe(stage);
  });

  it("leaves the June GDP third estimate unqualified for first-print selection", () => {
    const seriesKey = CONTEXT_SERIES.GDPC1.seriesKey;
    const observations = parseAlfredObservationsPayload(
      JSON.stringify(gdpVintages["2023-06-29"]),
      {
        seriesId: "GDPC1",
        mode: "as_of_vintage",
        fetchedAt,
        sourceUrlRedacted: "https://api.stlouisfed.org/fred/series/observations",
      },
    );
    const selected = selectRevisionForPeriod(observations, seriesKey, "2023-01-01", {
      cutoff: new Date("2023-07-01T00:00:00Z"),
      recordedThrough: fetchedAt,
      knowledgeMode: "PUBLIC_INFORMATION_RECONSTRUCTION",
      requireInitial: true,
    });
    expect(selected.status).toBe("missing");
    expect(observations[1]).toMatchObject({
      value: 20282.76,
      releaseStage: "UNKNOWN",
      valueKind: "UNRESOLVED",
      publicationDate: null,
      availableAt: null,
      availabilityQuality: "UNRESOLVED",
    });
  });

  it("qualifies the April GDP release with reviewed evidence for the exact row", () => {
    const publicationEvidence = [{
      seriesId: "GDPC1",
      observationPeriodStart: "2023-01-01",
      publicationDate: "2023-04-27",
      value: 20235.878,
      releaseStage: "INITIAL",
      reference: reviewedReference,
    }] as const;
    const meta = {
      seriesId: "GDPC1",
      mode: "as_of_vintage",
      fetchedAt,
      sourceUrlRedacted: "https://api.stlouisfed.org/fred/series/observations",
      publicationEvidence,
    } as const;
    const [olderPeriod, aprilRelease] = parseAlfredObservationsPayload(
      JSON.stringify(gdpVintages["2023-04-27"]),
      meta,
    );
    expect(olderPeriod.releaseStage).toBe("UNKNOWN");
    expect(olderPeriod.availableAt).toBeNull();
    expect(aprilRelease).toMatchObject({
      releaseStage: "INITIAL",
      valueKind: "INITIAL_REPORTED",
      availableAt: new Date("2023-04-28T04:00:00Z"),
      publishedAt: null,
      publicationEvidence: publicationEvidence[0],
    });
    const policy = {
      cutoff: new Date("2023-07-01T00:00:00Z"),
      recordedThrough: fetchedAt,
      knowledgeMode: "PUBLIC_INFORMATION_RECONSTRUCTION",
      requireInitial: true,
    } as const;
    const june = parseAlfredObservationsPayload(JSON.stringify(gdpVintages["2023-06-29"]), meta);
    expect(selectRevisionForPeriod(
      [...june, aprilRelease],
      CONTEXT_SERIES.GDPC1.seriesKey,
      "2023-01-01",
      policy,
    )).toEqual({ status: "selected", observation: aprilRelease });

    const wrongValue = { ...gdpVintages["2023-04-27"].observations[1], value: "20282.76" };
    const [mismatch] = parseAlfredObservationsPayload(JSON.stringify({ observations: [wrongValue] }), meta);
    expect(mismatch).toMatchObject({ releaseStage: "UNKNOWN", availableAt: null });

    const [, wrongSnapshot] = parseAlfredObservationsPayload(
      JSON.stringify(gdpVintages["2023-04-27"]),
      { ...meta, vintageDate: "2023-06-29" },
    );
    expect(wrongSnapshot).toMatchObject({ snapshotAsOf: null, releaseStage: "UNKNOWN", availableAt: null });
  });

  it.each([".", "", " \t ", null, "0x10", "0b1", "0o7"])("keeps invalid or missing input %j null", (value) => {
    const row = gdpVintages["2023-06-29"].observations[1];
    const observations = parseAlfredObservationsPayload(
      JSON.stringify({ observations: [{ ...row, value }, { ...row, value: "0" }] }),
      {
        seriesId: "GDPC1",
        mode: "as_of_vintage",
        fetchedAt,
        sourceUrlRedacted: "https://api.stlouisfed.org/fred/series/observations",
      },
    );
    expect(observations[0]).toMatchObject({ value: null, quality: "missing" });
    expect(observations[1].value).toBe(0);
  });

  it("A1: initial PAYEMS Jan 2023 is 155073 on 2023-02-03", () => {
    const obs = parseAlfredObservationsPayload(
      initialReleasePayload("payems-initial-jan2023.json"),
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
    expect(obs[0].quality).toBe("unknown_availability");
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

  it("A5: reviewed CPIAUCNS June 2022 evidence establishes its initial index without an invented instant", () => {
    const obs = parseAlfredObservationsPayload(
      initialReleasePayload("cpiaucns-june2022-initial.json"),
      {
        seriesId: "CPIAUCNS",
        mode: "initial_release_only",
        fetchedAt,
        sourceUrlRedacted: "https://api.stlouisfed.org/fred/series/observations",
        seriesKey: CONTEXT_SERIES.CPIAUCNS.seriesKey,
        unit: CONTEXT_SERIES.CPIAUCNS.unit,
        publicationEvidence: [{
          seriesId: "CPIAUCNS",
          observationPeriodStart: "2022-06-01",
          publicationDate: "2022-07-13",
          value: 296.311,
          releaseStage: "INITIAL",
          reference: reviewedReference,
        }],
      },
    );
    expect(obs[0].value).toBe(296.311);
    expect(obs[0].releaseStage).toBe("INITIAL");
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

  it("assigns stages only when a full-span revision history is complete", () => {
    const payload = JSON.parse(
      load("payems-jan2023-revision-history.json"),
    ) as { observations: unknown[] };
    const archive = {
      ...payload,
      realtime_start: ALFRED_FULL_REALTIME_START,
      realtime_end: ALFRED_FULL_REALTIME_END,
      output_type: 1,
      offset: 0,
      count: payload.observations.length,
    };
    const meta = {
      seriesId: "PAYEMS",
      mode: "revision_history",
      fetchedAt,
      sourceUrlRedacted: "https://api.stlouisfed.org/fred/series/observations",
    } as const;
    const [first, revised] = parseAlfredObservationsPayload(JSON.stringify(archive), meta);
    expect(first.releaseStage).toBe("INITIAL");
    expect(first.availableAt).toBeNull();
    expect(revised.releaseStage).toBe("REVISION");
    const truncated = parseAlfredObservationsPayload(
      JSON.stringify({ ...archive, observations: payload.observations.slice(1) }),
      meta,
    );
    expect(truncated[0].releaseStage).toBe("UNKNOWN");
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
