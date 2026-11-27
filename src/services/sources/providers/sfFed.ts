import type { DataProviderEntry } from "@/types/dataSources";

const TESTED_ON = "2026-11-27";
const WORKBOOK = "https://www.frbsf.org/wp-content/uploads/monetary-policy-surprises-data.xlsx";

export const SF_FED_PROVIDER: DataProviderEntry = {
  id: "sf_fed",
  name: "SF Fed Monetary Policy Surprises (Bauer–Swanson)",
  operator: "Federal Reserve Bank of San Francisco",
  category: "central_bank",
  homepage: "https://www.frbsf.org/research-and-insights/data-and-indicators/monetary-policy-surprises/",
  auth: { kind: "none", envVars: [], required: false, detail: "Public workbook download. No key." },
  freeTier: { costUsd: 0, limits: [], detail: "A single ~300 KB workbook. Download once per update." },
  licensing: {
    storage: "UNVERIFIED",
    redistribution: "UNVERIFIED",
    attributionRequired: true,
    summary: "Research dataset. Cite Bauer and Swanson (2023), NBER Macroeconomics Annual. Reuse terms not stated in the workbook.",
    termsUrl: null,
    basis: "DOCUMENTED",
  },
  implementations: [{ status: "OPEN_PR", path: "scripts/ingest/release-calendar/source-fomc-sffed.ts", pullRequest: 31 }],
  lastSuccessfulValidation: TESTED_ON,
  series: [
    {
      id: "sf_fed:fomc_update_2023",
      providerSeriesId: "FOMC (update 2023)",
      title: "FOMC announcement times and 30-minute futures surprises",
      unit: "Percentage points (futures rate changes), percent (SP500)",
      canonicalKeys: [],
      coverage: [
        {
          status: "TESTED",
          resolution: "per_event",
          accessTier: "anonymous",
          start: "1988-02-04",
          end: "2023-12-13",
          testedOn: TESTED_ON,
          evidence: `${WORKBOOK}: sheet 'FOMC (update 2023)' has 361 announcements (Date, Time, Unscheduled, FF1–ED4, SP500, …).`,
        },
        {
          status: "UNAVAILABLE",
          resolution: "per_event",
          accessTier: "anonymous",
          start: "2024-01-01",
          end: null,
          testedOn: TESTED_ON,
          unavailableReason: "not_published",
          evidence: "The changelog's last entry (10/11/2024) adds 2020–2023. No 2024+ announcements in the workbook.",
        },
      ],
      publication: {
        delay: "periodic_update",
        precision: "unknown",
        detail: "Irregular research updates. The page served the file with a 2026-11-25 cache-buster, but the data content ends 2023-12.",
        availabilityRule: null,
        basis: "TESTED",
      },
      revisions: {
        kind: "restated_with_changelog",
        detail: "Corrections are restated in place and listed in the Description sheet (e.g. 5/9/2022, 8/15/2022, 10/11/2024).",
        basis: "DOCUMENTED",
      },
      pointInTime: {
        status: "CONDITIONAL",
        reason:
          "Announcement times are a research record, not an official timestamp. Surprises are ex-post measurements, and the orthogonalized series is estimated on the full sample.",
        conditions: [
          "Use Time as research-grade timing only, with its own timing source label.",
          "Use raw surprises (not orthogonalized) for any no-lookahead feature.",
          "Pin the workbook revision used, since corrections restate history.",
        ],
      },
      notes: ["Sheet dates are Excel serials (32177 = 1988-02-04)."],
    },
  ],
};
