import type { DataProviderEntry } from "@/types/dataSources";

export const ATLANTA_FED_PROVIDER: DataProviderEntry = {
  id: "atlanta_fed",
  name: "Atlanta Fed GDPNow",
  operator: "Federal Reserve Bank of Atlanta",
  category: "central_bank",
  homepage: "https://www.atlantafed.org/research-and-data/data/gdpnow",
  auth: {
    kind: "none",
    envVars: [],
    required: false,
    detail: "Public research product. Adapter is fixture-driven by default; no key.",
  },
  freeTier: {
    costUsd: 0,
    limits: [],
    detail: "Public GDPNow page and archives. Fetch sparingly.",
  },
  licensing: {
    storage: "UNVERIFIED",
    redistribution: "RESTRICTED",
    attributionRequired: true,
    summary:
      "https://www.atlantafed.org/terms-of-use: non-commercial reproduction with attribution. Not an official forecast of the Federal Reserve System. Do not imply endorsement. Cautious reading: terms say nothing about durable storage — storage UNVERIFIED; redistribution RESTRICTED to non-commercial reproduction with attribution.",
    termsUrl: "https://www.atlantafed.org/terms-of-use",
    basis: "DOCUMENTED",
  },
  implementations: [
    { status: "MAIN", path: "src/services/expectations/adapters/gdpnow.ts" },
  ],
  lastSuccessfulValidation: null,
  series: [
    {
      id: "atlanta_fed:gdpnow",
      providerSeriesId: "GDPNow",
      title: "Atlanta Fed GDPNow real GDP growth nowcast",
      unit: "Percent, SAAR",
      canonicalKeys: [],
      coverage: [
        {
          status: "ADVERTISED",
          resolution: "1q",
          accessTier: "anonymous",
          start: "2011-07-01",
          end: null,
          citationUrl: "https://www.atlantafed.org/research-and-data/data/gdpnow",
          evidence:
            "Bank documents tracking archives from ~2011:Q3 / live model from 2014:Q2. Not live-probed for this registry entry.",
        },
      ],
      publication: {
        delay: "periodic_update",
        precision: "date",
        detail: "Updated several times per month on weekdays after source data. Spreadsheet tabs carry update dates.",
        availabilityRule: "Use the published update date; do not invent an intraday clock.",
        basis: "DOCUMENTED",
      },
      revisions: {
        kind: "revised_without_vintages",
        detail: "Nowcast path is restated as source data arrive; earlier path values are not versioned in the public file.",
        basis: "DOCUMENTED",
      },
      pointInTime: {
        status: "CONDITIONAL",
        reason: "A model nowcast, not a Street consensus, and update clocks are often date-only.",
        conditions: [
          "Label as MODEL_NOWCAST. Never store as consensus or use for Street surprise.",
          "Pin the update date from the published archive.",
        ],
      },
      notes: [],
    },
  ],
};
