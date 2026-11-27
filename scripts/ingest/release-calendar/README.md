# Historical release-calendar acquisition

Builds a calendar of macro releases and FOMC decisions with evidence for each
known schedule, publication date and clock. See [Ownership](#ownership-and-hand-off)
for how to use these facts alongside actuals and expectations.

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
| Fed statement pages (`federalreserve.gov`), discovered via `fomchistoricalYYYY.htm` + `fomccalendars.htm` | HTTPS, honest UA, 2 s/host | `OFFICIAL_RELEASE_RECORD` | Intended time in "For release at 2:00 p.m. EDT" lines and the date of the statement |
| SF Fed Bauer–Swanson workbook (`frbsf.org`) | HTTPS, honest UA | `SECONDARY_RESEARCH_DATASET` | Announcement time + unscheduled flag 1988–2023. **Never makes a timing VERIFIED.** |
| BEA news releases (`www.bea.gov/news/...`, archive 1996+) | HTTPS, honest UA, 2 s/host | `OFFICIAL_RELEASE_RECORD` | "EMBARGOED UNTIL RELEASE AT 8:30 a.m. EDT, …" / pre-2009 "FOR WIRE TRANSMISSION: 8:30 A.M. EDT, …" |
| BEA release-schedule ICS | HTTPS, honest UA | `OFFICIAL_SCHEDULE` | Scheduled instants, current + next year |
| BLS archived releases | **Operator-saved files only (`--bls-dir`)** | `OFFICIAL_RELEASE_RECORD` | Release day from the archive file name and intended embargo time |
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

## Timing and identity

Each record has an `identities` array of metric, reference period and stage
tuples. The resolver indexes every tuple. The scalar `referencePeriodStart`,
`releaseStage` and `metricKeys` fields remain available for display. A bundle
can pair different metrics with different months. The December 2025 BLS jobs
release identifies October and November payroll first prints and November
unemployment. An unresolved reference period provides no lookup key.

`timingFacts` carries three independently sourced clocks:

| Fact | Meaning |
|---|---|
| `intendedEmbargo` | The time printed in an embargo, wire-transmission or "For release at" line |
| `documentedPublication` | An official source documents that formal publication occurred at this time |
| `earliestEvidencedAvailability` | Earliest public availability supported by the retained evidence, with its precision and scope |

Each clock is null when unresolved. For May 15, 2024 CPI, the formal release
and intended embargo are both 08:30 ET. BLS documented that related files were
public around 07:58 ET. This evidence applies to the related files as a group.
The resolver does not infer when a particular headline or core CPI value was
first available. [BLS incident report](https://www.bls.gov/bls/teamofexperts60dayreport202411.pdf)

`releaseAtKind` identifies the meaning of the legacy `releaseAt` field.
`VERIFIED` carries a documented publication time, `SCHEDULED` an official
schedule, and `DATE_ONLY` a null instant. The record provider returns the
three facts as Date objects and omits secondary-only or conflicted records.
Refresh older `records.json` snapshots from the source cache before resolving
them. Those files predate explicit clock semantics and bundled identities.

- A published date takes precedence over a scheduled clock. A discrepancy
  with a retained schedule is flagged `SCHEDULE_DIFFERS_FROM_RECORD`.
- Conflicting official publication dates or times are withheld. Conflicting
  embargo clocks leave the intended time unresolved. Conflicting schedule
  clocks are withheld if there is no publication.
- Secondary research is retained for reconciliation. A research clock cannot
  qualify an instant for the resolver.
- Eastern clock fields must round-trip through `America/New_York`. Nonexistent
  readings remain unresolved. Repeated readings require a matching offset or
  EST/EDT abbreviation. A stale EST/EDT label on a unique clock reading is
  flagged `ZONE_LABEL_MISMATCH`.
- An official cancellation retires the associated schedule. BEA's explicit
  replacement language retires superseded stages within the same reference
  period, with the citation retained in `scheduleChanges`. The Q3 2025 GDP
  initial estimate replaced the advance and second estimates, and the updated
  estimate replaced the third. A replacement keeps its published stage.
  [BEA schedule update](https://www.bea.gov/news/blog/2025-12-10/economic-release-schedule-updates)
- Unscheduled FOMC actions carry the `UNSCHEDULED` flag when supported.
  Pre-February-1994 research rows carry `IMPLICIT_ANNOUNCEMENT`. The FOMC
  reference period is the announcement day and the metric is `FED_TARGET_UPPER`.

## Ownership and hand-off

- **Actuals** can use `releaseDate` to look up an ALFRED vintage for each
  identity. Actual first-print and availability claims require independent
  evidence under the historical provenance policy.
- **Expectations** need a cutoff supported for the metric and vintage. A
  scheduled or formal publication clock alone cannot establish whether a
  forecast preceded earlier public access. Apply the historical provenance
  policy when assigning a conservative date bound.
- **Daily market context** can inspect the calendar through
  `createRecordCalendarProvider(records)`, including the selected clock's
  meaning and any other evidenced clocks.

## Prior acquisition run (2026-11-27)

The live run covered BEA archives from 1996, the current and next year's BEA
schedule, and FOMC records from 1988. FRED matched 361 of 361 GDP release days
and 359 of 359 PIO release days. FRED also listed 54 GDP and 20 PIO days
without a BEA release, including comprehensive revision data loads. The same
run recorded 12 BEA zone-label mismatches around the 2007 DST rule change and
eight pages without an embargo or wire line. Offline replay reproduced the
calendar byte for byte.

## Known gaps

- BLS depth equals whatever an operator saves (the archives reach back to CPI 1999-06, Employment Situation 1995 and PPI 1998).
- Fed 1994–2015 statements usually provide a date only. Bauer–Swanson
  supplies research-grade times (`SECONDARY_TIME_ONLY`) through 2023.
- BEA ICS covers the current and next year only. Older BEA embargo timing
  depends on the archive page or text attachment carrying an embargo or wire line.
