/**
 * Optional live ALFRED smoke (not part of CI). Requires FRED_API_KEY.
 * Verifies adapter outputs against known revision fixtures without writing DB.
 *
 *   npx tsx scripts/maintenance/smoke-alfred-live.ts
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

import { fetchAlfredObservations } from "../../src/services/context/alfred";
import { CONTEXT_SERIES } from "../../src/services/context/definitions";
import {
  vintageConsistentMom,
  vintageConsistentQoqSaar,
} from "../../src/services/context/transforms";

// Prefer the worktree `.env`; fall back to the primary checkout when agents
// share a worktree without copying secrets.
loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({
  path: resolve(process.cwd(), "..", "..", "ImpactFeedAI", ".env"),
});

async function main(): Promise<void> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    throw new Error("FRED_API_KEY is required");
  }

  const httpGet = async (url: string) => {
    const res = await fetch(url);
    return {
      ok: res.ok,
      status: res.status,
      text: async () => res.text(),
    };
  };

  const first = await fetchAlfredObservations({
    request: {
      seriesId: "PAYEMS",
      observationStart: "2022-11-01",
      observationEnd: "2023-01-01",
      mode: "as_of_vintage",
      vintageDate: "2023-02-03",
    },
    apiKey,
    httpGet,
    seriesKey: CONTEXT_SERIES.PAYEMS.seriesKey,
    unit: CONTEXT_SERIES.PAYEMS.unit,
  });
  const empty = await fetchAlfredObservations({
    request: {
      seriesId: "PAYEMS",
      observationStart: "2023-01-01",
      observationEnd: "2023-01-01",
      mode: "as_of_vintage",
      vintageDate: "2023-02-02",
    },
    apiKey,
    httpGet,
  });
  const init = await fetchAlfredObservations({
    request: {
      seriesId: "PAYEMS",
      observationStart: "2023-01-01",
      observationEnd: "2023-01-01",
      mode: "initial_release_only",
    },
    apiKey,
    httpGet,
    seriesKey: CONTEXT_SERIES.PAYEMS.seriesKey,
    unit: CONTEXT_SERIES.PAYEMS.unit,
  });
  const gdp = await fetchAlfredObservations({
    request: {
      seriesId: "GDPC1",
      observationStart: "2022-10-01",
      observationEnd: "2023-01-01",
      mode: "as_of_vintage",
      vintageDate: "2023-04-27",
    },
    apiKey,
    httpGet,
    seriesKey: CONTEXT_SERIES.GDPC1.seriesKey,
    unit: CONTEXT_SERIES.GDPC1.unit,
  });

  const mom = vintageConsistentMom(first.observations, 2);
  const saar = vintageConsistentQoqSaar(gdp.observations, 1);

  const report = {
    firstStatus: first.status,
    firstDetail: first.detail ?? null,
    mom,
    emptyStatus: empty.status,
    emptyDetail: empty.detail ?? null,
    emptyCount: empty.observations.length,
    initStatus: init.status,
    initDetail: init.detail ?? null,
    initValue: init.observations[0]?.value ?? null,
    initPublishedAt: init.observations[0]?.publishedAt ?? null,
    initQuality: init.observations[0]?.quality ?? null,
    gdpStatus: gdp.status,
    gdpDetail: gdp.detail ?? null,
    gdpSaar: saar,
  };
  console.log(JSON.stringify(report, null, 2));

  if (first.status !== "ok" || mom.status !== "ok" || mom.value !== 517) {
    throw new Error(
      `PAYEMS first-print MoM regression (${first.detail ?? first.status})`,
    );
  }
  if (empty.status !== "missing" || empty.observations.length !== 0) {
    throw new Error("pre-release vintage must be empty/missing");
  }
  if (init.observations[0]?.value !== 155073) {
    throw new Error("PAYEMS initial release value regression");
  }
  if (init.observations[0]?.publishedAt !== null) {
    throw new Error("must not invent publishedAt from vintage date");
  }
  if (saar.status !== "ok" || saar.value !== 1.1) {
    throw new Error("GDPC1 advance SAAR regression");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
