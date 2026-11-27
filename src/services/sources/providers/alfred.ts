import type { DataProviderEntry, DataSeriesEntry } from "@/types/dataSources";

const TESTED_ON = "2026-11-27";

function vintageSeries(
  providerSeriesId: string,
  title: string,
  canonicalKey: string,
  vintageCount: number,
  firstVintage: string,
  lastVintage: string,
  notes: readonly string[] = [],
): DataSeriesEntry {
  return {
    id: `alfred:${providerSeriesId}`,
    providerSeriesId,
    title,
    unit: "Same as the FRED series",
    canonicalKeys: [canonicalKey],
    coverage: [
      {
        status: "TESTED",
        resolution: "per_vintage",
        accessTier: "free_key",
        start: firstVintage,
        end: lastVintage,
        testedOn: TESTED_ON,
        evidence: `Live fred/series/vintagedates returned ${vintageCount} vintage dates.`,
      },
    ],
    publication: {
      delay: "scheduled_release",
      precision: "date",
      detail: "A vintage's realtime_start is the date FRED recorded the publication. It has no time of day.",
      availabilityRule:
        "Select the vintage whose realtime_start is on or before the release date. Take the release instant from the publisher calendar.",
      basis: "TESTED",
    },
    revisions: {
      kind: "revised_with_vintages",
      detail: "Every published revision is kept as a separate vintage.",
      basis: "TESTED",
    },
    pointInTime: {
      status: "CONDITIONAL",
      reason:
        "Vintages are dated, not timed. realtime_start says which day a value appeared, not whether it was public before an intraday cutoff on that day.",
      conditions: [
        "Take the release instant from an independently verified publisher release record, never from the vintage date.",
        "A vintage dated on the cutoff day counts as known only after that verified release instant. Without one, treat it as unknown until the next day.",
        "Never assume a vintage is known at an exact intraday cutoff based on its date alone.",
      ],
    },
    notes,
  };
}

export const ALFRED_PROVIDER: DataProviderEntry = {
  id: "alfred",
  name: "ALFRED (Archival FRED) vintages",
  operator: "Federal Reserve Bank of St. Louis",
  category: "central_bank",
  homepage: "https://alfred.stlouisfed.org/",
  auth: {
    kind: "api_key",
    envVars: ["FRED_API_KEY"],
    required: true,
    detail:
      "Same key and host as FRED. Vintages are selected with realtime_start / realtime_end or vintage_dates on fred/series/observations.",
  },
  freeTier: {
    costUsd: 0,
    limits: [
      { value: 120, unit: "requests", per: "minute", basis: "THIRD_PARTY", note: "Shared with FRED. No rate headers returned." },
    ],
    detail:
      "output_type 2/4 refuse realtime ranges that span too many vintages, so first-print extraction is one request per release date.",
  },
  licensing: {
    storage: "RESTRICTED",
    redistribution: "RESTRICTED",
    attributionRequired: true,
    summary:
      "Same FRED legal terms as the fred provider (https://fred.stlouisfed.org/legal/): Prohibition (p) bars database storage/caching without permission; Prohibition (j) requires prior written permission for internet display and commercial use. Required notice: \"This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.\"",
    termsUrl: "https://fred.stlouisfed.org/legal/",
    basis: "DOCUMENTED",
  },
  implementations: [
    { status: "MAIN", path: "scripts/ingest/fetch-macro.ts" },
    { status: "MAIN", path: "src/services/context/alfred.ts" },
  ],
  lastSuccessfulValidation: TESTED_ON,
  series: [
    vintageSeries("PAYEMS", "Nonfarm payrolls vintages", "Nonfarm payrolls (MoM change)", 861, "1955-05-06", "2026-11-06", [
      "Spot check: Feb-2022 level as of 2022-03-04 = 150399, current vintage = 150825.",
    ]),
    vintageSeries("CPIAUCSL", "CPI-U SA vintages", "CPI (headline, YoY)", 671, "1972-07-21", "2026-11-10", [
      "The pipeline's headline CPI uses NSA CPIAUCNS. This SA series is the vintage-rich comparator.",
    ]),
    vintageSeries("UNRATE", "Unemployment rate vintages", "Unemployment rate", 801, "1960-03-15", "2026-11-06"),
    vintageSeries("GDPC1", "Real GDP vintages", "Real GDP growth (QoQ, annualised)", 421, "1991-12-04", "2026-11-25", [
      "Advance, second and third estimates are separate vintages. The stage must be inferred from the release calendar.",
    ]),
  ],
};
