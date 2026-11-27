# Historical release-calendar acquisition

Builds an evidence-preserving calendar of **when** each macro release and FOMC
decision reached the public. It answers timing only; values (actuals) and
expectations live elsewhere (see [Ownership](#ownership-and-hand-off)).

```bash
npm run calendar:build                                     # fed + sffed + bea + fred
npm run calendar:build -- --source fed --source sffed      # FOMC only
npm run calendar:build -- --bls-dir ~/bls-saved            # + operator-saved BLS documents
npm run calendar:build:offline                             # replay from cache, no network
```

Output goes to `data/release-calendar/` (gitignored):

| File | Contents |
|---|---|
| `records.json` | `ReleaseCalendarRecord[]`, one per release, with all evidence merged |
| `observations.json` | Every per-source observation before merging |
| `reconciliation.json` | Official release days vs FRED `release/dates`, per family |
| `run-report.json` | Per-source status (`ok`/`partial`/`failed`/`skipped`), notes, counts |
| `cache/` | Raw responses (sha256-verified, secrets redacted) used for offline replay |

**No database connection is opened and no migration is required.** Records are
projected onto the existing `HistoricalReleaseCalendarProvider` contract by
`createRecordCalendarProvider` in `src/services/macro/release-calendar-records.ts`.

## Sources and access policy

| Source | Access | Evidence kind | What it proves |
|---|---|---|---|
| Fed statement pages (`federalreserve.gov`), discovered via `fomchistoricalYYYY.htm` + `fomccalendars.htm` | HTTPS, honest UA, 2 s/host | `OFFICIAL_RELEASE_RECORD` | Exact time from 2016 onward ("For release at 2:00 p.m. EDT"); date only for 1994–2015 ("For immediate release") |
| SF Fed Bauer–Swanson workbook (`frbsf.org`) | HTTPS, honest UA | `SECONDARY_RESEARCH_DATASET` | Announcement time + unscheduled flag 1988–2023. **Never makes a timing VERIFIED.** |
| BEA news releases (`www.bea.gov/news/...`, archive 1996+) | HTTPS, honest UA, 2 s/host | `OFFICIAL_RELEASE_RECORD` | "EMBARGOED UNTIL RELEASE AT 8:30 a.m. EDT, …" / pre-2009 "FOR WIRE TRANSMISSION: 8:30 A.M. EDT, …" |
| BEA release-schedule ICS | HTTPS, honest UA | `OFFICIAL_SCHEDULE` | Scheduled instants, current + next year |
| BLS archived releases | **Operator-saved files only (`--bls-dir`)** | `OFFICIAL_RELEASE_RECORD` | Release day (archive file name) + embargo instant |
| FRED `release/dates` | API key | reconciliation only | Days FRED recorded a release; never creates or upgrades a record |

`polite-fetch.ts` is the only network path. It enforces a host allowlist,
**refuses `bls.gov` and `apps.bea.gov` before any request**, never impersonates
a browser, and stops contacting a host after HTTP 403/429 rather than retrying
with different headers. `apps.bea.gov/robots.txt` disallows `/`. bls.gov answers
non-browser clients with 403 and prohibits bot activity outside BLS usage policy.

### BLS: operator procedure

1. In a normal browser, open the archive index pages and save them as
   `cpi.htm`, `empsit.htm`, `ppi.htm`:
   `https://www.bls.gov/bls/news-release/cpi.htm` (likewise `empsit.htm`, `ppi.htm`).
2. Save each release you need as **HTML or TXT** (not PDF), keeping BLS's file
   name (`cpi_01112024.htm`, `empsit_11202025.htm`, `cpi_07151999.txt`).
3. Run `npm run calendar:build -- --bls-dir <folder>`. The run report lists
   every release the index names that you have not supplied.

Each saved document's file mtime is recorded as `retrievedAt`, and its canonical
`https://www.bls.gov/news.release/...` URL as the citation.

## Timing rules

| Status | Meaning | Projected onto contract |
|---|---|---|
| `VERIFIED` | An official release record states the clock time | yes, `releaseAt` set |
| `SCHEDULED` | Only an official schedule states the time | yes |
| `DATE_ONLY` | An official document proves the day only | yes, `releaseAt: null` |
| `SECONDARY_ONLY` | Only research evidence exists (e.g. pre-1994 FOMC) | **no** (null) |

There is no fallback clock: 08:30 or 14:00 are never assumed. A record carrying
`DATE_CONFLICT` or `TIME_CONFLICT` is withheld (null) by the contract provider.

- **DST**: the publisher's Washington wall clock is authoritative. A printed
  EST/EDT label that disagrees with `America/New_York` at that instant is
  flagged `ZONE_LABEL_MISMATCH` and never used to shift the time.
- **Shutdowns / reschedules**: the official record's date wins. If an official
  schedule disagrees, the record gets `SCHEDULE_DIFFERS_FROM_RECORD`. Reference
  periods come only from release titles, never from "previous month", because
  shutdown-delayed releases (September 2025 payrolls on 2025-11-20) break that rule.
- **Unscheduled FOMC actions**: conference calls, notation votes, "(unscheduled)"
  headings, and the Bauer–Swanson `Unscheduled=1` flag set `unscheduled: true` +
  `UNSCHEDULED`. Pre-February-1994 rows carry `IMPLICIT_ANNOUNCEMENT`.
- **Stages**: GDP stage wording is kept source-faithful (`ADVANCE`,
  `SECOND_ESTIMATE`, `THIRD_ESTIMATE`, and the pre-2009 `PRELIMINARY` / `FINAL`).
  The verbatim wording is in `stageLabel`. Monthly releases are `INITIAL` for
  their reference month.
- **FOMC identity**: `referencePeriodStart` is the announcement day; the metric key is `FED_TARGET_UPPER`.

## Ownership and hand-off

This layer owns **historical release timing** only.

- **Actuals (Agent 03)**: use `record.releaseDate` as the ALFRED vintage date
  (`realtime_start = realtime_end = releaseDate`) to read the first print, and
  `record.releaseStage` / `referencePeriodStart` to key it. Do not derive timing
  from ALFRED vintages; they are date-only.
- **Expectations (Agent 04)**: an expectation is pre-release only if its as-of
  is strictly before `releaseAt` (VERIFIED/SCHEDULED). For `DATE_ONLY` records,
  require the as-of to fall before the start of `releaseDate` in New York.
- **Daily market context (Agent 14)**: anchor context cutoffs on
  `createRecordCalendarProvider(records)`, which returns contract-validated
  timing. `SECONDARY_ONLY` and conflicted records resolve to null by design.

## Measured coverage (live run, 2026-11-27)

| Family | VERIFIED | SCHEDULED | DATE_ONLY | SECONDARY_ONLY | Span |
|---|---|---|---|---|---|
| BEA GDP | 360 | 14 | – | – | 1996 → 2027 schedule |
| BEA Personal Income & Outlays | 358 | 14 | – | – | 1996 → 2027 schedule |
| FOMC statements | 92 | – | 155 | 131 | 1988 → 2026 |
| BLS CPI / PPI / Employment Situation | operator-supplied | | | | |

- **FRED reconciliation:** 361/361 GDP and 359/359 PIO official days appear in FRED. FRED
  also lists 54 GDP and 20 PIO days with no BEA release (comprehensive-revision data loads,
  e.g. 1999-10-29 → 11-03). That is why FRED stays reconciliation-only.
- **FOMC `SECONDARY_ONLY`:** pre-1994 implicit announcements (98), 1994–1999 no-change meetings
  that had no statement, and three 2020 facility announcements that are not policy statements.
- **`ZONE_LABEL_MISMATCH`:** 12 BEA releases printed EDT/EST against the zone in force,
  clustered around the 2007 DST rule change. The wall clock was kept.
- **Excluded:** 8 BEA pages had no embargo or wire line (listed in `run-report.json`).
- **Replay:** an offline replay reproduces `records.json` byte for byte.

## Known gaps

- BLS depth equals whatever an operator saves (the archives reach back to CPI 1999-06, Employment Situation 1995 and PPI 1998).
- Fed 1994–2015 statements are `DATE_ONLY` from the official page. Bauer–Swanson
  supplies research-grade times (`SECONDARY_TIME_ONLY`) through 2023.
- BEA ICS covers the current and next year only. Older BEA timing depends on
  each release page or its text attachment carrying an embargo or wire line.
