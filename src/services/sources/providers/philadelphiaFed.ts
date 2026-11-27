import type { DataProviderEntry } from "@/types/dataSources";

export const PHILADELPHIA_FED_PROVIDER: DataProviderEntry = {
  id: "philadelphia_fed",
  name: "Philadelphia Fed Survey of Professional Forecasters",
  operator: "Federal Reserve Bank of Philadelphia",
  category: "central_bank",
  homepage:
    "https://www.philadelphiafed.org/surveys-and-data/real-time-data-research/survey-of-professional-forecasters",
  auth: {
    kind: "none",
    envVars: [],
    required: false,
    detail: "Public downloadable survey files. Adapter is fixture-driven by default; no key.",
  },
  freeTier: {
    costUsd: 0,
    limits: [],
    detail: "Public SPF mean/median/individual Excel downloads. Fetch sparingly.",
  },
  licensing: {
    storage: "UNVERIFIED",
    redistribution: "UNVERIFIED",
    attributionRequired: true,
    summary:
      "Site /terms-of-use returned 404 on 2026-11-27 licensing audit. Terms UNVERIFIED — do not invent reuse permissions. Cite the Philadelphia Fed when using SPF figures.",
    termsUrl: null,
    basis: "UNVERIFIED",
  },
  implementations: [
    { status: "MAIN", path: "src/services/expectations/adapters/spf.ts" },
  ],
  lastSuccessfulValidation: null,
  series: [
    {
      id: "philadelphia_fed:spf",
      providerSeriesId: "Survey of Professional Forecasters",
      title: "SPF mean/median growth and inflation forecasts",
      unit: "Percent (horizon-dependent)",
      canonicalKeys: [],
      coverage: [
        {
          status: "ADVERTISED",
          resolution: "1q",
          accessTier: "anonymous",
          start: "1968-10-01",
          end: null,
          citationUrl:
            "https://www.philadelphiafed.org/surveys-and-data/real-time-data-research/survey-of-professional-forecasters",
          evidence:
            "Bank documents quarterly SPF history from 1968:Q4 (CPI from 1981:Q3). Not live-probed for this registry entry.",
        },
      ],
      publication: {
        delay: "scheduled_release",
        precision: "date",
        detail:
          "Survey deadlines and public release dates are published (spf-release-dates). Exact release clocks are often absent.",
        availabilityRule: "Prefer DATE_ONLY from the published release-date list; do not invent a clock.",
        basis: "DOCUMENTED",
      },
      revisions: {
        kind: "unknown",
        detail: "Whether published SPF files are restated after release has not been verified.",
        basis: "UNVERIFIED",
      },
      pointInTime: {
        status: "CONDITIONAL",
        reason: "Quarterly professional survey; wrong frequency/horizon for monthly Street surprise.",
        conditions: [
          "Label as PROFESSIONAL_SURVEY. Never use for monthly Street-surprise arithmetic.",
          "Require a published results-release date for asOf.",
        ],
      },
      notes: [],
    },
  ],
};
