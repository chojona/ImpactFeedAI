import type { DataProviderEntry } from "@/types/dataSources";

export const FEDERAL_RESERVE_BOARD_PROVIDER: DataProviderEntry = {
  id: "federal_reserve_board",
  name: "Federal Reserve Board FOMC statements",
  operator: "Board of Governors of the Federal Reserve System",
  category: "central_bank",
  homepage: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
  auth: {
    kind: "none",
    envVars: [],
    required: false,
    detail: "Public HTML statement archive and calendars. No key.",
  },
  freeTier: {
    costUsd: 0,
    limits: [],
    detail: "Public pages on www.federalreserve.gov. Fetch sparingly.",
  },
  licensing: {
    storage: "PERMITTED",
    redistribution: "PERMITTED",
    attributionRequired: true,
    summary:
      "https://www.federalreserve.gov/disclaimer.htm: Board materials are generally in the public domain. Cite the Board of Governors of the Federal Reserve System as the source.",
    termsUrl: "https://www.federalreserve.gov/disclaimer.htm",
    basis: "DOCUMENTED",
  },
  implementations: [
    { status: "MAIN", path: "scripts/ingest/release-calendar/source-fomc-fed.ts" },
  ],
  lastSuccessfulValidation: null,
  series: [
    {
      id: "federal_reserve_board:fomc_statements",
      providerSeriesId: "fomchistorical + fomccalendars Statement links",
      title: "FOMC policy statement pages and announcement timing",
      unit: "Release instants or dates",
      canonicalKeys: [],
      coverage: [
        {
          status: "ADVERTISED",
          resolution: "per_event",
          accessTier: "anonymous",
          start: "1994-01-01",
          end: null,
          citationUrl: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
          evidence:
            "source-fomc-fed.ts documents historical year pages and the recent calendar. Not live-probed for this registry entry.",
        },
      ],
      publication: {
        delay: "scheduled_release",
        precision: "instant",
        detail:
          "From 2016 many statement pages print \"For release at 2:00 p.m. ET\" (verified instant). Earlier pages often say \"For immediate release\" with a date only.",
        availabilityRule: "Use the printed release clock when present; otherwise DATE_ONLY from the statement date.",
        basis: "DOCUMENTED",
      },
      revisions: {
        kind: "unknown",
        detail: "Corrections to archived statement pages are not versioned here.",
        basis: "UNVERIFIED",
      },
      pointInTime: {
        status: "CONDITIONAL",
        reason: "Pre-2016 pages often lack an intraday clock.",
        conditions: [
          "Require a verified \"For release at …\" line for instant-precision timing.",
          "Without a clock, treat availability as DATE_ONLY.",
        ],
      },
      notes: [],
    },
  ],
};
