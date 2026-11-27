import type { DataProviderEntry } from "@/types/dataSources";

export const BEA_PROVIDER: DataProviderEntry = {
  id: "bea",
  name: "Bureau of Economic Analysis",
  operator: "U.S. Bureau of Economic Analysis",
  category: "government_statistics",
  homepage: "https://www.bea.gov/",
  auth: {
    kind: "none",
    envVars: [],
    required: false,
    detail:
      "Release-calendar ingest uses www.bea.gov news pages and the public ICS schedule. No API key. apps.bea.gov is never contacted (robots.txt disallows /).",
  },
  freeTier: {
    costUsd: 0,
    limits: [],
    detail:
      "www.bea.gov permits crawling for the news archive and ICS. apps.bea.gov/robots.txt disallows /; do not hit the Data API host from this pipeline.",
  },
  licensing: {
    storage: "PERMITTED",
    redistribution: "PERMITTED",
    attributionRequired: true,
    summary:
      "U.S. federal government data. Required notice: \"This product uses the Bureau of Economic Analysis (BEA) Data API but is not endorsed or certified by BEA.\" Cite BEA as the source.",
    termsUrl: null,
    basis: "DOCUMENTED",
  },
  implementations: [
    { status: "MAIN", path: "scripts/ingest/release-calendar/source-bea.ts" },
  ],
  lastSuccessfulValidation: null,
  series: [
    {
      id: "bea:news_release_schedule",
      providerSeriesId: "news/schedule/ics + news/archive",
      title: "BEA GDP and Personal Income & Outlays release timing",
      unit: "Release instants (ET)",
      canonicalKeys: [],
      coverage: [
        {
          status: "ADVERTISED",
          resolution: "per_event",
          accessTier: "anonymous",
          start: "1996-01-01",
          end: null,
          citationUrl: "https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics",
          evidence:
            "source-bea.ts documents news-release archive from 1996 and ICS for current + next year. Not live-probed for this registry entry.",
        },
      ],
      publication: {
        delay: "scheduled_release",
        precision: "instant",
        detail:
          "Modern releases print an embargo line (e.g. 8:30 a.m. ET). ICS DTSTART carries the scheduled UTC instant.",
        availabilityRule: "Use the verified embargo or ICS instant; never the reference period.",
        basis: "DOCUMENTED",
      },
      revisions: {
        kind: "unknown",
        detail: "Schedule revisions appear as updated ICS or corrected release pages; not versioned here.",
        basis: "UNVERIFIED",
      },
      pointInTime: {
        status: "CONDITIONAL",
        reason: "Timing is usable only when the embargo/ICS instant is verified for that release.",
        conditions: ["Pair each observation with a verified BEA release record or ICS DTSTART."],
      },
      notes: ["apps.bea.gov is disallowed by robots.txt and is never fetched."],
    },
  ],
};
