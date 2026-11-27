import type {
  CoverageClaim,
  DataProviderEntry,
  DataSeriesEntry,
  PointInTimeEligibility,
  PublicationTiming,
  Resolution,
  RevisionBehavior,
} from "@/types/dataSources";

const TESTED_ON = "2026-11-27";

/** FRED's `fred/series` metadata, fetched live for each series on TESTED_ON. */
function metadataClaim(resolution: Resolution, start: string, end: string): CoverageClaim {
  return {
    status: "TESTED",
    resolution,
    accessTier: "free_key",
    start,
    end,
    testedOn: TESTED_ON,
    evidence: "Live fred/series metadata: observation_start → observation_end.",
  };
}

// ── Macro series served as CURRENT vintage ─────────────────────────────────

const MACRO_TIMING: PublicationTiming = {
  delay: "scheduled_release",
  precision: "date",
  detail:
    "FRED mirrors the publisher's release. Observation dates are reference periods, not publication dates, and the endpoint returns no release instant.",
  availabilityRule:
    "Take publication from the publisher's release calendar. Never use the observation date.",
  basis: "DOCUMENTED",
};

const MACRO_REVISIONS: RevisionBehavior = {
  kind: "revised_with_vintages",
  detail:
    "fred/series/observations returns the latest revised values. Earlier vintages exist only through ALFRED (see the alfred provider).",
  basis: "TESTED",
};

const MACRO_PIT: PointInTimeEligibility = {
  status: "INELIGIBLE",
  reason: "This endpoint serves current-vintage values, which are not the values markets saw on release day.",
  conditions: [],
};

function macroSeries(
  providerSeriesId: string,
  title: string,
  unit: string,
  canonicalKey: string,
  resolution: Resolution,
  start: string,
  end: string,
  notes: readonly string[] = [],
): DataSeriesEntry {
  return {
    id: `fred:${providerSeriesId}`,
    providerSeriesId,
    title,
    unit,
    canonicalKeys: [canonicalKey],
    coverage: [metadataClaim(resolution, start, end)],
    publication: MACRO_TIMING,
    revisions: MACRO_REVISIONS,
    pointInTime: MACRO_PIT,
    notes,
  };
}

// ── Daily market series ────────────────────────────────────────────────────

const DAILY_REVISIONS: RevisionBehavior = {
  kind: "unknown",
  detail: "ALFRED keeps vintages for these series too. How often they are revised has not been measured.",
  basis: "UNVERIFIED",
};

const DAILY_PIT: PointInTimeEligibility = {
  status: "CONDITIONAL",
  reason: "FRED returns an observation date, not a publication instant.",
  conditions: [
    "Set availableAt no earlier than the measured publication lag (conservatively the next calendar day, or later where the lag is longer).",
    "Validate dates against the NYSE calendar. Holiday rows exist.",
  ],
};

function dailySeries(
  providerSeriesId: string,
  title: string,
  unit: string,
  canonicalKeys: readonly string[],
  start: string,
  end: string,
  timingDetail: string,
  notes: readonly string[] = [],
): DataSeriesEntry {
  return {
    id: `fred:${providerSeriesId}`,
    providerSeriesId,
    title,
    unit,
    canonicalKeys,
    coverage: [metadataClaim("1d", start, end)],
    publication: {
      delay: "next_business_day",
      precision: "date",
      detail: timingDetail,
      availabilityRule: "availableAt = start of the next calendar day after the observation date, at the earliest.",
      basis: "TESTED",
    },
    revisions: DAILY_REVISIONS,
    pointInTime: DAILY_PIT,
    notes,
  };
}

const NEXT_MORNING =
  "On 2026-11-27 the series ended one day earlier and last_updated was that morning (Central time).";
const NEXT_AFTERNOON =
  "H.15 yields: on 2026-11-27 the series ended 2026-11-24 and last_updated was 2026-11-25 15:16 CT, so date D appears on D+1.";
const SAME_EVENING =
  "On 2026-11-27 the series ended 2026-11-25 and last_updated was 2026-11-25 around 16:00–22:40 CT (same evening).";

export const FRED_PROVIDER: DataProviderEntry = {
  id: "fred",
  name: "FRED API",
  operator: "Federal Reserve Bank of St. Louis",
  category: "central_bank",
  homepage: "https://fred.stlouisfed.org/docs/api/fred/",
  auth: {
    kind: "api_key",
    envVars: ["FRED_API_KEY"],
    required: true,
    detail: "Sent as the api_key query parameter. Redact it from every logged URL.",
  },
  freeTier: {
    costUsd: 0,
    limits: [
      { value: 120, unit: "requests", per: "minute", basis: "THIRD_PARTY", note: "No rate-limit headers are returned (tested)." },
      { value: 100000, unit: "observations", per: "request", basis: "DOCUMENTED" },
    ],
    detail: "Free with a key. Pipelines serialise requests.",
  },
  licensing: {
    storage: "RESTRICTED",
    redistribution: "RESTRICTED",
    attributionRequired: true,
    summary:
      "https://fred.stlouisfed.org/legal/: Prohibition (p) bars storing, caching, archiving, or incorporating FRED® Content in a database without permission; Prohibition (j) bars commercial use without prior written consent. The unlettered \"Property Rights and Licenses\" section bars displaying, posting, or transmitting FRED® Content on any Internet/Intranet/Extranet site without the Bank’s prior written permission. AI/ML: \"Use the FRED® Services or FRED® Content in connection with the development or training of any … machine learning … or … artificial intelligence\" is prohibited (Prohibited Use on /legal/; also API Prohibition (k)). Required notice (https://fred.stlouisfed.org/docs/api/terms_of_use.html): \"This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.\" Third-party: VIXCLS is Copyrighted: Citation required (Cboe); SP500 needs S&P DJI pre-approval and is more restricted than FRED-origin series.",
    termsUrl: "https://fred.stlouisfed.org/legal/",
    basis: "DOCUMENTED",
  },
  implementations: [
    { status: "MAIN", path: "scripts/ingest/sources-fred.ts" },
    { status: "MAIN", path: "scripts/ingest/fetch-macro.ts" },
    { status: "MAIN", path: "scripts/ingest/sources-fomc.ts" },
    // release/dates as reconciliation evidence for the historical release calendar.
    { status: "MAIN", path: "scripts/ingest/release-calendar/source-fred.ts" },
    { status: "MAIN", path: "src/services/market-context/fred.ts" },
  ],
  lastSuccessfulValidation: TESTED_ON,
  series: [
    macroSeries("CPIAUCNS", "CPI-U all items, NSA", "Index 1982-1984=100", "CPI (headline, YoY)", "1mo", "1913-01-01", "2026-10-01"),
    macroSeries("CPILFENS", "CPI-U less food and energy, NSA", "Index 1982-1984=100", "Core CPI (ex food & energy, YoY)", "1mo", "1957-01-01", "2026-10-01"),
    // NSA final-demand index: BLS headline YoY is unadjusted (PPIFIS is SA).
    macroSeries("PPIFID", "PPI final demand, NSA", "Index Nov 2009=100", "PPI (final demand, YoY)", "1mo", "2009-11-01", "2026-10-01"),
    macroSeries("PAYEMS", "All employees, total nonfarm", "Thous. of Persons", "Nonfarm payrolls (MoM change)", "1mo", "1939-01-01", "2026-10-01"),
    macroSeries("UNRATE", "Unemployment rate", "%", "Unemployment rate", "1mo", "1948-01-01", "2026-10-01"),
    macroSeries("FEDFUNDS", "Effective federal funds rate, monthly average", "%", "Effective federal funds rate (monthly average)", "1mo", "1954-07-01", "2026-10-01", [
      "A monthly average, not an FOMC decision.",
    ]),
    macroSeries("PCEPI", "PCE price index", "Index 2017=100", "PCE price index (headline, YoY)", "1mo", "1959-01-01", "2026-10-01"),
    macroSeries("PCEPILFE", "PCE price index ex food and energy", "Index 2017=100", "Core PCE price index (YoY)", "1mo", "1959-01-01", "2026-10-01"),
    macroSeries("GDPC1", "Real GDP", "Bil. of Chn. 2017 $", "Real GDP growth (QoQ, annualised)", "1q", "1947-01-01", "2026-07-01", [
      "Advance, second and third estimates are not distinguished by this endpoint.",
    ]),
    macroSeries("UMCSENT", "University of Michigan consumer sentiment", "Index 1966:Q1=100", "UMich consumer sentiment (index)", "1mo", "1952-11-01", "2026-10-01"),
    macroSeries("JTSJOL", "JOLTS job openings", "Level in Thous.", "JOLTS job openings (MoM change)", "1mo", "2000-12-01", "2026-09-01"),
    {
      id: "fred:DFEDTARU",
      providerSeriesId: "DFEDTARU",
      title: "Federal funds target range, upper limit",
      unit: "%",
      canonicalKeys: ["Fed funds target rate (upper bound)", "market:DFEDTARU:target_pct"],
      coverage: [metadataClaim("1d", "2008-12-16", "2026-11-27")],
      publication: {
        delay: "same_day_eod",
        precision: "date",
        detail: "Dated by effective date. On 2026-11-27 it was current through that day (updated 07:01 CT).",
        availabilityRule: "Announcement timing comes from the FOMC calendar, not from this series.",
        basis: "TESTED",
      },
      revisions: { kind: "none", detail: "A policy setting, not an estimate.", basis: "UNVERIFIED" },
      pointInTime: {
        status: "CONDITIONAL",
        reason: "The step date is the effective date, usually the day after the announcement. Holds produce no step.",
        conditions: ["Take decision instants and hold meetings from the FOMC calendar or statement archive."],
      },
      notes: [],
    },
    dailySeries("DFEDTARL", "Federal funds target range, lower limit", "%", ["market:DFEDTARL:target_pct"], "2008-12-16", "2026-11-27", "Same publication as DFEDTARU."),
    dailySeries("VIXCLS", "Cboe VIX close (FRED mirror)", "Index", ["market:VIXCLS:level"], "1990-01-02", "2026-11-26", NEXT_MORNING, [
      "FRED tags Copyrighted: Citation required (Cboe). Prefer the Cboe CSV as primary.",
      "Contains a 2026-11-26 (Thanksgiving) row.",
    ]),
    dailySeries("VXVCLS", "Cboe 3-month VIX close (FRED mirror)", "Index", [], "2007-12-04", "2026-11-25", NEXT_MORNING, [
      "Starts earlier than Cboe's VIX3M CSV (2009-09-18).",
    ]),
    dailySeries("DGS3MO", "3-month Treasury constant maturity", "%", ["market:DGS3MO:yield_pct"], "1981-09-01", "2026-11-24", NEXT_AFTERNOON),
    dailySeries("DGS2", "2-year Treasury constant maturity", "%", ["market:DGS2:yield_pct"], "1976-06-01", "2026-11-24", NEXT_AFTERNOON),
    dailySeries("DGS10", "10-year Treasury constant maturity", "%", ["market:DGS10:yield_pct"], "1962-01-02", "2026-11-24", NEXT_AFTERNOON),
    dailySeries("T10Y2Y", "10-year minus 2-year Treasury spread", "%", [], "1976-06-01", "2026-11-25", SAME_EVENING),
    dailySeries("T5YIE", "5-year breakeven inflation", "%", ["market:T5YIE:breakeven_pct"], "2003-01-02", "2026-11-25", SAME_EVENING),
    dailySeries("T10YIE", "10-year breakeven inflation", "%", ["market:T10YIE:breakeven_pct"], "2003-01-02", "2026-11-25", SAME_EVENING),
    {
      ...dailySeries("SP500", "S&P 500 index close", "Index", [], "2016-11-28", "2026-11-24", NEXT_MORNING, [
        "Licensed by S&P DJI: pre-approval required; FRED serves a rolling 10 years only. More restricted than FRED-origin series.",
      ]),
      coverage: [
        { ...metadataClaim("1d", "2016-11-28", "2026-11-24") },
        {
          status: "UNAVAILABLE",
          resolution: "1d",
          accessTier: "free_key",
          start: "1957-03-04",
          end: "2016-11-25",
          testedOn: TESTED_ON,
          unavailableReason: "not_licensed",
          evidence: "observation_start is 2016-11-28. The series notes cite the S&P DJI agreement that limits FRED to 10 years.",
        },
      ],
    },
    dailySeries("NASDAQ100", "Nasdaq-100 index close", "Index", [], "1986-01-02", "2026-11-25", SAME_EVENING, [
      "Copyright Nasdaq. Redistribution terms follow the series notes.",
    ]),
  ],
};
