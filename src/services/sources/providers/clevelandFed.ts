import type { DataProviderEntry } from "@/types/dataSources";

const TESTED_ON = "2026-11-27";

export const CLEVELAND_FED_PROVIDER: DataProviderEntry = {
  id: "cleveland_fed",
  name: "Cleveland Fed Inflation Nowcasting",
  operator: "Federal Reserve Bank of Cleveland",
  category: "central_bank",
  homepage: "https://www.clevelandfed.org/indicators-and-data/inflation-nowcasting",
  auth: { kind: "none", envVars: [], required: false, detail: "Public chart JSON. No key." },
  freeTier: {
    costUsd: 0,
    limits: [],
    detail: "No published rate limit. nowcast_month.json is ~7.7 MB, so fetch at most daily.",
  },
  licensing: {
    storage: "UNVERIFIED",
    redistribution: "UNVERIFIED",
    attributionRequired: true,
    summary: "Public research product. Attribute the Cleveland Fed. Not an official forecast. Site terms not reviewed.",
    termsUrl: null,
    basis: "THIRD_PARTY",
  },
  implementations: [
    { status: "OPEN_PR", path: "src/services/expectations/adapters/clevelandNowcast.ts", pullRequest: 21 },
  ],
  lastSuccessfulValidation: TESTED_ON,
  series: [
    {
      id: "cleveland_fed:nowcast_month",
      providerSeriesId: "inflationnowcasting/nowcast_month.json",
      title: "Daily MoM nowcasts of CPI, core CPI, PCE and core PCE, per target month",
      unit: "Month-over-month percent change",
      canonicalKeys: [],
      coverage: [
        {
          status: "TESTED",
          resolution: "1d",
          accessTier: "anonymous",
          start: "2013-07-01",
          end: "2026-11-27",
          testedOn: TESTED_ON,
          evidence:
            "nowcast_month.json returned 161 target-month charts, subcaption 2013-7 → 2026-11, generated 2026-11-27.",
        },
      ],
      publication: {
        delay: "next_business_day",
        precision: "date",
        detail: "Updated each business day. Chart labels are MM/DD with no year. The target month comes from the subcaption.",
        availabilityRule: "Use the last daily value dated strictly before the release day.",
        basis: "TESTED",
      },
      revisions: {
        kind: "unknown",
        detail: "The whole file is regenerated daily. Whether 2013–2014 values are real-time or back-filled is unresolved.",
        basis: "UNVERIFIED",
      },
      pointInTime: {
        status: "CONDITIONAL",
        reason: "A model nowcast, not a consensus, and early history may be back-filled.",
        conditions: [
          "Label as MODEL_NOWCAST. Never store as consensus or use for Street surprise.",
          "Confirm real-time status of early history (nowcasting FAQ) before using pre-2015 values.",
        ],
      },
      notes: ["Quarterly and yearly variants exist (nowcast_quarter.json, nowcast_year.json) and were not tested."],
    },
  ],
};
