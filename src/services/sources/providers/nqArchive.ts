import type { DataProviderEntry } from "@/types/dataSources";

const TESTED_ON = "2026-11-27";

export const NQ_ARCHIVE_PROVIDER: DataProviderEntry = {
  id: "nq_archive",
  name: "Local Databento NQ outright archive",
  operator: "Databento (purchased dataset, held locally)",
  category: "local_archive",
  homepage: "https://databento.com/docs",
  auth: {
    kind: "local_path",
    envVars: ["NQ_ARCHIVE_ROOT", "NQ_OUTRIGHT_PARQUET", "NQ_ROLLS_CSV"],
    required: true,
    detail:
      "Set NQ_ARCHIVE_ROOT to the external databento-nq-full-history directory, or set the individual file paths. The archive is never copied into the repository.",
  },
  freeTier: {
    costUsd: 0,
    limits: [],
    detail:
      "Already purchased (acceptance report: about $27 against an $85 ceiling). Reading it costs nothing. Extending it would be a new purchase and is out of scope.",
  },
  licensing: {
    storage: "PERMITTED",
    redistribution: "UNVERIFIED",
    attributionRequired: false,
    summary:
      "Licensed vendor data held for personal research. Treat as non-redistributable. Never commit bars or manifests to git.",
    termsUrl: "https://databento.com/terms",
    basis: "UNVERIFIED",
  },
  implementations: [{ status: "OPEN_PR", path: "src/services/market/nqArchive/index.ts", pullRequest: 22 }],
  lastSuccessfulValidation: TESTED_ON,
  series: [
    {
      id: "nq_archive:nq_outright_ohlcv_1m",
      providerSeriesId: "nq_outright_ohlcv_1m",
      title: "NQ quarterly outright futures, 1-minute OHLCV (within-contract)",
      unit: "Index points",
      canonicalKeys: [],
      coverage: [
        {
          status: "TESTED",
          resolution: "1m",
          accessTier: "local_licensed",
          start: "2010-06-07",
          end: "2026-10-06",
          testedOn: TESTED_ON,
          evidence:
            "Read the archive's acceptance-report.md and rolls.csv: 6,784,816 deduplicated bars, 67 chunks, 66 roll boundaries. The parquet itself was not opened.",
        },
        {
          status: "UNAVAILABLE",
          resolution: "1m",
          accessTier: "local_licensed",
          start: null,
          end: null,
          testedOn: TESTED_ON,
          unavailableReason: "not_licensed",
          evidence: "Trades, MBO and status schemas were not part of the purchase (certification-report.md).",
        },
      ],
      publication: {
        delay: "static_archive",
        precision: "instant",
        detail: "Bars carry bar-open UTC instants and Databento ts_event nanoseconds.",
        availabilityRule: "A bar is available at its open + 1 minute.",
        basis: "DOCUMENTED",
      },
      revisions: {
        kind: "restated_with_changelog",
        detail:
          "The archive is fixed. The provider revised 2026-10-06 after discovery, and both snapshots are kept in provenance.",
        basis: "DOCUMENTED",
      },
      pointInTime: {
        status: "CONDITIONAL",
        reason:
          "Only 11 sessions are certified (ACCEPT): 2026-09-14 to 2026-09-25 plus 2026-10-06. 4,194 observed dates are unresolved for lack of an authoritative CME schedule.",
        conditions: [
          "Strict measurements only on ACCEPT sessions (accepted-sessions.csv).",
          "Contract selection by prior-session volume roll. Never the continuous series.",
          "Pre-2012-11-19 trade-date assignment needs the CME pause correction.",
        ],
      },
      notes: ["Acceptance status: FAIL_ACCEPTANCE_CALENDAR_AND_SOURCE_LIMITATIONS (2026-10-08)."],
    },
  ],
};
