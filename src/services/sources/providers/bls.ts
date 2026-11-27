import type { DataProviderEntry } from "@/types/dataSources";

const TESTED_ON = "2026-11-27";

const TESTED_WINDOW =
  "Authenticated v2 POST (catalog=true, calculations=true) for 2005–2024 returned REQUEST_SUCCEEDED; the 20-year span and catalog are key-only features.";

const API_TIMING = {
  delay: "scheduled_release",
  precision: "instant",
  detail:
    "BLS publishes at 08:30 ET on its release calendar. The time-series API returns year/period/value only and carries no publication timestamp.",
  availabilityRule:
    "Only from a verified release-calendar instant for that reference period; never from the observation period itself.",
  basis: "DOCUMENTED",
} as const;

export const BLS_PROVIDER: DataProviderEntry = {
  id: "bls",
  name: "BLS Public Data API",
  operator: "U.S. Bureau of Labor Statistics",
  category: "government_statistics",
  homepage: "https://www.bls.gov/developers/",
  auth: {
    kind: "api_key",
    envVars: ["BLS_API_KEY"],
    required: false,
    detail:
      "Key optional. Without it v2 caps history per request and drops catalog/calculations. Pass it as `registrationkey` in the POST body, never in a URL.",
  },
  freeTier: {
    costUsd: 0,
    limits: [
      { value: 20, unit: "years", per: "request", withKey: true, basis: "TESTED" },
      { value: 500, unit: "requests", per: "day", withKey: true, basis: "DOCUMENTED" },
      { value: 50, unit: "series", per: "request", withKey: true, basis: "DOCUMENTED" },
      { value: 25, unit: "requests", per: "day", withKey: false, basis: "DOCUMENTED" },
      { value: 10, unit: "years", per: "request", withKey: false, basis: "DOCUMENTED" },
    ],
    detail:
      "api.bls.gov accepts scripted clients. The www.bls.gov website returns HTTP 403 to non-browser clients, so release-schedule pages must come from saved archives, not automated fetches.",
  },
  licensing: {
    storage: "PERMITTED",
    redistribution: "PERMITTED",
    attributionRequired: true,
    summary:
      "U.S. federal government work, public domain (https://www.bls.gov/opub/copyright-information.htm). Required statement (termsOfService.htm): \"BLS.gov cannot vouch for the data or analyses derived from these data after the data have been retrieved from BLS.gov.\" Cite BLS; do not present derived values as BLS figures.",
    termsUrl: "https://www.bls.gov/developers/termsOfService.htm",
    basis: "DOCUMENTED",
  },
  implementations: [
    { status: "MAIN", path: "scripts/ingest/sources-bls.ts" },
    // Release timing from operator-saved archive documents; bls.gov is never fetched.
    { status: "MAIN", path: "scripts/ingest/release-calendar/source-bls-local.ts" },
  ],
  lastSuccessfulValidation: TESTED_ON,
  series: [
    {
      id: "bls:CUUR0000SA0",
      providerSeriesId: "CUUR0000SA0",
      title: "CPI-U, all items, U.S. city average, not seasonally adjusted",
      unit: "Index 1982-84=100",
      canonicalKeys: ["CPI (headline, YoY)"],
      coverage: [
        {
          status: "TESTED",
          resolution: "1mo",
          accessTier: "free_key",
          start: "2005-01-01",
          end: "2024-12-01",
          testedOn: TESTED_ON,
          evidence: `${TESTED_WINDOW} 260 rows (240 monthly plus 20 M13 annual averages).`,
        },
        {
          status: "ADVERTISED",
          resolution: "1mo",
          accessTier: "anonymous",
          start: "1913-01-01",
          end: null,
          citationUrl: "https://www.bls.gov/cpi/data.htm",
          evidence: "BLS documents CPI-U history from 1913. Not requested here.",
        },
      ],
      publication: API_TIMING,
      revisions: {
        kind: "none",
        detail:
          "Not-seasonally-adjusted CPI-U is not revised after publication. Seasonally adjusted CPI series are revised each February for five years.",
        basis: "DOCUMENTED",
      },
      pointInTime: {
        status: "CONDITIONAL",
        reason: "Value is final at first print, but the API gives no publication time.",
        conditions: ["Pair each period with a verified BLS release-calendar instant."],
      },
      notes: ["Period M13 is an annual average, not a month. Drop it before monthly transforms."],
    },
    {
      id: "bls:CUUR0000SA0L1E",
      providerSeriesId: "CUUR0000SA0L1E",
      title: "CPI-U, all items less food and energy, not seasonally adjusted",
      unit: "Index 1982-84=100",
      canonicalKeys: ["Core CPI (ex food & energy, YoY)"],
      coverage: [
        {
          status: "TESTED",
          resolution: "1mo",
          accessTier: "free_key",
          start: "2005-01-01",
          end: "2024-12-01",
          testedOn: TESTED_ON,
          evidence: "Authenticated v2 POST for 2005–2024 returned REQUEST_SUCCEEDED with 240 monthly rows.",
        },
        {
          status: "ADVERTISED",
          resolution: "1mo",
          accessTier: "anonymous",
          start: "1957-01-01",
          end: null,
          citationUrl: "https://www.bls.gov/cpi/data.htm",
          evidence: "Core CPI-U history from 1957, matching FRED CPILFENS. Not requested from BLS here.",
        },
      ],
      publication: API_TIMING,
      revisions: {
        kind: "none",
        detail: "Not-seasonally-adjusted CPI-U indexes are not revised after publication.",
        basis: "DOCUMENTED",
      },
      pointInTime: {
        status: "CONDITIONAL",
        reason: "Value is final at first print, but the API gives no publication time.",
        conditions: ["Pair each period with a verified BLS release-calendar instant."],
      },
      notes: [],
    },
    {
      id: "bls:CES0000000001",
      providerSeriesId: "CES0000000001",
      title: "Total nonfarm payroll employment, seasonally adjusted",
      unit: "Thousands of persons",
      canonicalKeys: ["Nonfarm payrolls (MoM change)"],
      coverage: [
        {
          status: "TESTED",
          resolution: "1mo",
          accessTier: "free_key",
          start: "2005-01-01",
          end: "2024-12-01",
          testedOn: TESTED_ON,
          evidence: `${TESTED_WINDOW} 240 monthly rows.`,
        },
        {
          status: "ADVERTISED",
          resolution: "1mo",
          accessTier: "anonymous",
          start: "1939-01-01",
          end: null,
          citationUrl: "https://www.bls.gov/ces/",
          evidence: "BLS documents CES national history from 1939. Not requested here.",
        },
      ],
      publication: API_TIMING,
      revisions: {
        kind: "revised_without_vintages",
        detail:
          "Revised in each of the next two monthly releases and by the annual benchmark. The API serves only the latest values.",
        basis: "DOCUMENTED",
      },
      pointInTime: {
        status: "INELIGIBLE",
        reason: "The API returns revised values; first prints are not recoverable from it.",
        conditions: [],
      },
      notes: ["Use ALFRED PAYEMS vintages for first prints."],
    },
    {
      id: "bls:LNS14000000",
      providerSeriesId: "LNS14000000",
      title: "Unemployment rate, 16 years and over, seasonally adjusted",
      unit: "Percent",
      canonicalKeys: ["Unemployment rate"],
      coverage: [
        {
          status: "TESTED",
          resolution: "1mo",
          accessTier: "free_key",
          start: "2005-01-01",
          end: "2024-12-01",
          testedOn: TESTED_ON,
          evidence: `${TESTED_WINDOW} 240 monthly rows.`,
        },
        {
          status: "ADVERTISED",
          resolution: "1mo",
          accessTier: "anonymous",
          start: "1948-01-01",
          end: null,
          citationUrl: "https://www.bls.gov/cps/",
          evidence: "BLS documents CPS unemployment history from 1948. Not requested here.",
        },
      ],
      publication: API_TIMING,
      revisions: {
        kind: "revised_without_vintages",
        detail:
          "Seasonal factors are re-estimated each January and revise the last five years. The API serves only current values.",
        basis: "DOCUMENTED",
      },
      pointInTime: {
        status: "INELIGIBLE",
        reason: "Seasonally adjusted history is restated in place.",
        conditions: [],
      },
      notes: ["Use ALFRED UNRATE vintages for first prints."],
    },
  ],
};
