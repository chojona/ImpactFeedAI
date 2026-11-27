# Phase 1 integration and research-readiness audit

**Decision: NO-GO for Phase 1 research.** November 27, 2026.

| | |
| --- | --- |
| Audited commit | `main` @ `bcf0ba1` (merge of #35). The audit began on `951671a`; #32 and #35 landed during the audit and touch only `package.json`, `package-lock.json` and `.github/dependabot.yml`. Every verification and dry run was re-run on `bcf0ba1`. Results for `951671a` are kept in [`baseline-951671a/`](2026-11-27-phase-1-readiness/baseline-951671a/) and agree apart from timestamps. |
| Mode | Read-only. No source changes, schema migrations, backfills, applies, deployments, trades or backtests. No market or macro data was downloaded. $0 spent. |
| Evidence | [`2026-11-27-phase-1-readiness/`](2026-11-27-phase-1-readiness/). Local absolute paths are redacted to `$REPO`, `$SCRATCH`, `$NQ_ARCHIVE_ROOT` and `$CALENDAR_WORKTREE`. |
| Previous gate | [Phase 0.5 remediation](2026-11-05-phase-0.5-remediation.md): NO-GO, with explicit criteria for reconsidering. Section 10 evaluates each one. |

## 1. Executive summary

The engineering build is healthy. The research pipeline is not yet connected.

- **Verification passes on current `main`.** `npm ci`, Prisma generate, typecheck, lint, 917 of 917 tests (56 files), coverage thresholds, `prisma validate` and a production build with no database environment all pass. The production `npm audit` reports 0 vulnerabilities.
- **The Phase 1 subsystems are built but unused in production.** No app route and no `package.json` script reaches any of these modules; only tests do:
  - `services/context`: ALFRED, vintage transforms, features
  - `services/expectations`
  - `services/market-context`
  - `services/market/nqArchive`

  That is 49 modules in total. The historical release calendar is built by a script, but nothing reads its output.
- **Nothing in the schema can hold the new inputs.** The schema has five tables. None of them can store calendar records, ALFRED vintages, expectation snapshots, market-context observations or NQ eligibility labels. Wiring the pipeline therefore needs a migration, which is out of scope for this audit and needs an owner decision.
- **No event in any of the five families is research-eligible.**
  - Point-in-time actuals: 0 of 21 legacy actuals qualify.
  - Verified consensus: 0 of 21 rows.
  - The provenance gate rejects every ALFRED observation by construction (B4).
  - The NQ archive cannot reach the measurement engine (`undeclared_symbol`).
- **The strict research universe is one release.** Joining official timing with ACCEPT NQ sessions leaves only FOMC 2026-09-16. It has no actual, no expectation and no surprise.
- **Phase 0.5 measurement blockers are unchanged.** The offline verifier replay still finds 180 invalid and 132 missing rows. The v4 recomputation still has 75 unresolved changes. The write gate still freezes every v4 apply.

## 2. Method and constraint compliance

| Step | What was done | Network / DB |
| --- | --- | --- |
| Sync | `git fetch --prune`, fast-forward `main`, branch `audit/phase1-integration-readiness` | GitHub only |
| Isolated verification | Detached worktree of `main` in scratch. `npm ci` from the lockfile, then the exact CI sequence from `.github/workflows/ci.yml` | npm registry (lockfile packages only). No DB env vars, no `.env` |
| DB inventory | One aggregate SELECT-only snapshot through `createDryRunPrismaClient` (`scripts/lib/readonly-prisma.ts`). The server confirmed `default_transaction_read_only=on` and `transaction_read_only=on` | One read-only session to the configured Postgres |
| Release calendar | `build.ts --offline --out $SCRATCH/calendar-replay`, replaying the existing raw cache with no API keys in the environment | None |
| Measurement replays | `verify-reaction-measurements.ts --snapshot …` and `recompute-reaction-impact.ts --snapshot … --inputs …` | None |
| End-to-end dry runs | `scripts/e2e-dryrun.mts.txt` runs the real module APIs on local inputs only | None. Reads the captured DB snapshot file, not the DB |
| NQ archive | Read-only from the external archive through `NQ_ARCHIVE_ROOT`, set inline. No bars were copied or committed | None |
| Code review | Import-graph reachability, plus two delegated read-only reviews (macro chain and market chain). Every finding cited here was re-verified directly; claims that could not be re-verified were dropped | None |

**Untouched:** the user's checkout and `node_modules`, the `.env` file, production tables, the measurement write gate, the database schema and every `--apply` path.

## 3. Verification and build (`bcf0ba1`)

| Command | Result | Evidence |
| --- | --- | --- |
| `npm ci` | exit 0, 588 packages | [01](2026-11-27-phase-1-readiness/01-npm-ci.log) |
| `npm run db:generate` | exit 0, Prisma Client 7.10.1 | [02](2026-11-27-phase-1-readiness/02-db-generate.log) |
| `npm run typecheck` | exit 0 | [03](2026-11-27-phase-1-readiness/03-typecheck.log) |
| `npm run lint` | exit 0 | [04](2026-11-27-phase-1-readiness/04-lint.log) |
| `npm run test:coverage` | exit 0. 56 files, 917 tests passed. Statements 92.46%, branches 88.8%, functions 93.93%, lines 93.35%; all thresholds met | [05](2026-11-27-phase-1-readiness/05-test-coverage.log) |
| `npm run db:validate` | exit 0 | [06](2026-11-27-phase-1-readiness/06-db-validate.log) |
| `npm run build` (no `DATABASE_URL` / `DIRECT_URL`) | exit 0. Next.js 16.4.6. `/` static; `/api/events`, `/brief`, `/calendar`, `/events/[id]`, `/feed`, `/patterns`, `/quality` dynamic | [07](2026-11-27-phase-1-readiness/07-build.log) |
| `npm audit --omit=dev` | 0 vulnerabilities | [08](2026-11-27-phase-1-readiness/08-npm-audit.log) |
| `npm audit` (including dev) | 11 findings (1 low, 7 moderate, 3 high), all dev tooling through `typescript-eslint` → `minimatch`. Informational; CI's soft-fail audit covers production dependencies only | [09](2026-11-27-phase-1-readiness/09-npm-audit-all.log) |

On the audit-start commit `951671a` the results were identical: 917/917 tests and the same coverage ([baseline](2026-11-27-phase-1-readiness/baseline-951671a/05-test-coverage.log)).

**Local environment:** the user's main checkout has a stale `node_modules`. `npm ls` shows Next 16.2.6 against a lock pinning 16.4.6, Prisma 7.8 against 7.10.1, and `hyparquet` missing. Commands run there will not match CI until `npm ci` is run. This audit did not modify it.

## 4. Inventory

### 4.1 Providers (static registry, `src/services/sources/`)

`npm run audit:sources` ([60](2026-11-27-phase-1-readiness/60-audit-sources.log)) reports 10 providers and 44 series. Claims: 47 tested, 6 advertised, 15 unavailable. **0 series are point-in-time `ELIGIBLE`.**

| Provider | Code status in registry | PIT eligible / conditional / ineligible |
| --- | --- | --- |
| bls | MAIN (+ `OPEN_PR` pointer, stale) | 0 / 2 / 2 |
| fred | MAIN (+ `OPEN_PR` pointer, stale) | 0 / 12 / 11 |
| alfred | MAIN | 0 / 4 / 0 |
| alpha_vantage | NONE | 0 / 0 / 2 |
| yahoo | MAIN | 0 / 2 / 0 |
| cboe | MAIN | 0 / 3 / 0 |
| treasury | MAIN | 0 / 2 / 0 |
| cleveland_fed | MAIN | 0 / 1 / 0 |
| sf_fed | **OPEN_PR #31 (stale; #31 merged in `761da9d`)** | 0 / 1 / 0 |
| nq_archive | MAIN | 0 / 1 / 1 |

**Code that has no registry entry:**
- BEA news releases (`scripts/ingest/release-calendar/source-bea.ts`)
- Federal Reserve Board FOMC pages (`source-fomc-fed.ts`)
- Atlanta Fed GDPNow, Philadelphia Fed SPF and archived news (`src/services/expectations/adapters/*`)

`src/services/expectations/sources.ts` keeps a separate list of expectation sources that does not reference the registry.

### 4.2 Scripts

The import graph ([10](2026-11-27-phase-1-readiness/10-import-reachability.txt)) roots at the 21 `tsx` entrypoints in `package.json` and the 13 files under `src/app/`.

| Group | Entrypoints | Writes when applied |
| --- | --- | --- |
| Ingest | `ingest`, `auto-ingest` (`--source fred`, `--source fomc`), `calendar:build` (JSON files only) | `events`, `data_releases`, **`asset_reactions` (v2 archive)** (`ingest.ts:241`, `auto-ingest.ts:295`) |
| Backfill | `backfill:prices` (v2, `backfill-prices.ts:237`), `backfill:candles`, `backfill:reaction-measurements` (computes v4; apply refused by the gate) | `asset_reactions`, `candles`, `reaction_measurements` |
| Maintenance / verification | `db:verify` (counts the v2 archive only, `verify-db.ts:20,44-62`), `verify:candles`, `verify:reaction-measurements`, `verify:actual-provenance`, `audit:sources`, `audit:reaction-*`, `inventory:candles`, `probe:candles`, `smoke:*`, `validate:phase05`, `repair:*`, `promote:timing` | `repair:*` and `promote:timing` are gated |
| Not wired | `scripts/maintenance/smoke-alfred-live.ts` (ad hoc only) | — |

### 4.3 Routes

`/` redirects to `/brief` (`src/app/page.tsx`).

The pages `/brief`, `/calendar`, `/quality`, `/feed`, `/events/[id]` and `/patterns`, plus `GET /api/events`, all read Postgres through `src/services/events/`. Candle charts read the `candles` table (`services/market/candles.ts:214`, used by `EventMarketChart.tsx`).

The app has no write routes or Server Actions, and makes no provider calls at render time.

### 4.4 Database (read-only snapshot, [20](2026-11-27-phase-1-readiness/20-db-snapshot.json), captured 2026-11-27T16:56Z)

Four migrations are applied, none rolled back. The counts are unchanged since November 5.

| Table | Rows | Coverage |
| --- | --- | --- |
| `events` | 50 | See the breakdown below |
| `data_releases` | 21 | CPI YoY 7, fed funds upper 7, NFP MoM 5, PPI YoY 2. `metric_key`, `reference_period_start` and `actual_source` are NULL on all 21 rows. Consensus is UNVERIFIED on 20 and MISSING on 1. All `consensus_source` values are NULL |
| `asset_reactions` | 597 | Legacy v2 archive: 357 rows with no version, 240 rows of v2 |
| `candles` | 1,276 | SPY and QQQ only, `ONE_HOUR`, `AS_TRADED`, `yahoo-finance2@3.14.0`, 2024-09-09 → 2025-07-03 (638 each) |
| `reaction_measurements` | 828 | All `calculation_version` 3. 20 events (CPI 7, FOMC 6, NFP 5, PPI 2) × 12 Yahoo proxy symbols. Three session measures × 240, plus `INTRADAY_60M` × 108 (9 events). 2022-07-13 → 2025-07-03. **0 v4 rows** |

The 50 events break down as:

| Type | Count | Timing status | Range or note |
| --- | --- | --- | --- |
| CPI | 7 | SCHEDULED | 2022-07-13 → 2025-06-11 |
| NFP | 5 | SCHEDULED | |
| PPI | 2 | SCHEDULED | |
| FED_DECISION | 6 | SCHEDULED | |
| FED_DECISION | 1 | UNVERIFIED | Jackson Hole speech, 2025-08-22 |
| MACRO_DATA | 3 | UNVERIFIED | Two GDP events plus ISM; no `DataRelease` rows |
| TARIFF | 11 | UNVERIFIED | |
| GEOPOLITICAL | 8 | UNVERIFIED | |
| EARNINGS | 7 | UNVERIFIED | |

There are no PCE events.

### 4.5 Local datasets (outside git)

| Dataset | Location | State |
| --- | --- | --- |
| Databento NQ outright 1m | `$NQ_ARCHIVE_ROOT`, 154 MB parquet; sha256 `16a626bf…4c44`, rolls `40776afb…5eb5e` | 6,784,816 bars, 2010-06-07 → 2026-10-06, 66 rolls. Acceptance: `FAIL_ACCEPTANCE_CALENDAR_AND_SOURCE_LIMITATIONS`. Strict allowlist: 11 sessions, all Tier A (2026-09-14..25 and 2026-10-06). Exploratory allowlist: 1,347 rows, made up of those 11 Tier A sessions plus 1,336 Tier B sessions (2018-02 → 2026). `NQ_ARCHIVE_ROOT` is **not set** in `.env` |
| Release-calendar raw cache | `$CALENDAR_WORKTREE/data/release-calendar/cache` (1,049 files, 96 MB), a sibling worktree | Offline replay from `bcf0ba1` reproduces `records.json` (`e9679876…26e9`) and `observations.json` (`45431b11…bd73`) byte for byte ([31](2026-11-27-phase-1-readiness/31-calendar-hashes.txt)). `data/` is gitignored and **no other checkout has it** |
| Operator-saved BLS documents | none found (repo, `~/Downloads`, `.env`) | CPI, NFP and PPI official release timing is unavailable |
| Committed audit evidence | `docs/audits/2026-11-05-phase-0.5/` | `measurement-snapshot.json` (v3 rows), `recomputation-inputs.json` (transformed Yahoo inputs) |
| Test fixtures | `tests/fixtures/{alfred,expectations,market-context}` | Small samples, used only as labelled fixtures below |
| DB backup | `backups/pre-timing-migration-2026-08-20…json` (gitignored) | Pre-migration snapshot, not used |

## 5. Integration trace

Each row checks whether producer output actually reaches its consumer in a runnable path (an npm script or app route) and with a compatible contract.

| Link | Wired? | Contract compatible? | Evidence |
| --- | --- | --- | --- |
| Release calendar → `Event.releaseAt` / `timingStatus` | **No.** `build.ts` writes JSON only (`build.ts:62,238-242`). `createRecordCalendarProvider` / `resolveHistoricalRelease` are used only in `tests/releaseCalendarRecords.test.ts`. `promote-seed-timing.ts` reads `SEED_EVENTS` only | Partly. The status enum is a subset of `EventTimingStatus`, and instants agree with the DB for all 6 FOMC seeds (dry run: `matchesCaseReleaseAt: true`). But `Event` has no metric key, reference period or stage to join on. FOMC auto-ingest keys by the DFEDTARU **effective** date (`sources-fomc.ts:135`); the calendar keys by announcement day | [30](2026-11-27-phase-1-readiness/30-calendar-offline-replay.log), [50](2026-11-27-phase-1-readiness/50-e2e-dryrun.log) |
| ALFRED first print → `DataRelease.actualValue` | **No.** `context/alfred.ts` is reachable only from tests. `fetch-macro.ts` has its own FRED client | **No.** `actualProvenance.hasEvidence` requires an HTTPS URL **without a query string** (`actualProvenance.ts:45`). Every ALFRED API URL has one, so every observation fails `missing_revision_evidence` and `missing_initial_release_evidence`. Availability is `CONSERVATIVE_DATE_BOUND` (next New York midnight), and no code combines it with the calendar instant, so the result is also `unverified_availability`. The schema has no columns for vintage, availability or payload hash | Dry run on CPIAUCNS, PAYEMS and GDPC1 |
| Expectations → `DataRelease.expectedValue` / `consensusStatus` | **No.** All adapters are fixture-only; nothing in `services/expectations` fetches, and no writer calls `toConsensusEstimate` | Type-assignable to `ConsensusEstimate`, but **units and metric keys are not checked.** `CPI_HEADLINE_MOM` (not in `METRICS`, unit `pct_level`) passes through as a valid estimate of 0.2. SPF CPI is `pct_saar` and Cleveland core PCE is `pct_level` MoM, while canonical is `pct_yoy` | [51](2026-11-27-phase-1-readiness/51-expectations-unit-check.log), [50](2026-11-27-phase-1-readiness/50-e2e-dryrun.json) |
| NQ archive → candles / measurements | **No.** No `MeasurementSeriesProvider` uses it. `sessionBasisFor("NQ")` is null (`sessionBasis.ts:39-60`), so the engine returns `undeclared_symbol` | `NqMinuteBar` → `IntradayBar` is a trivial mapping. `DailyBar` needs a CME-day close aggregator, which doesn't exist. Neither `Candle` nor `ReactionMeasurement` can store the strict/exploratory label | Dry run, `reactionEngineOnNq: REFUSED` for all 6 cases |
| Candle preservation → reaction measurement | **No.** `backfill-reaction-measurements.ts:329` uses `createYahooMeasurementProvider()` and fetches live. Stored candles feed only the chart | Daily measures need SPLIT_ADJUSTED daily bars, and no `ONE_DAY` candles are stored. The planner's coverage check loads SPY `ONE_DAY` candles (`backfill-candles.ts:224-247`), so it can never prove coverage and fails closed | — |
| Market context (Cboe / Treasury / FRED) → features | **No.** No persistence and no consumer | Types and units compose (`MarketContextObservation`, `index_points`, `pct_level`). But Treasury and FRED both emit `market:DGS2/DGS10:yield_pct`, and Cboe and FRED both emit `market:VIXCLS:level` (`series.ts:13-21`, `treasury.ts:44-48`, `cboe.ts:100`). Any two rows on the same date are quarantined as a conflict (`pointInTime.ts:195-207`) | — |
| Reaction engine → production table | v3 rows are read by the app. Writes are frozen | `CURRENT_REACTION_CALCULATION_VERSION = 3` while `COMPUTED_… = 4` (`timing.ts:32,36`). The gate allows only v3 (`measurementWriteGate.ts:66`), and `MEASUREMENT_CUTOVER_AUTHORIZATIONS = []` (`:37`). The only writer computes v4, so **no new measurement of any version can be written** | Recompute replay [41](2026-11-27-phase-1-readiness/41-recompute-replay.log) |

## 6. Disconnected code, stale pointers, duplication and incompatible contracts

Severity: **B** = blocks Phase 1, **M** = major integrity risk, **m** = minor.

| # | Sev | Finding | Evidence |
| --- | --- | --- | --- |
| D1 | B | 49 Phase 1 modules are reachable only from tests: `services/context` (13), `services/expectations` (14), `services/market-context` (10) and `services/market/nqArchive` (12) | [10](2026-11-27-phase-1-readiness/10-import-reachability.txt) |
| D2 | B | No persistence model for calendar records, vintage observations, expectation snapshots, context observations or eligibility labels. The schema has `Event`, `DataRelease`, `AssetReaction`, `Candle` and `ReactionMeasurement` only | `prisma/schema.prisma` |
| D3 | M | `fetch-macro.ts:323-331` silently falls back to the **current** vintage when no vintage exists, and still records `actualSource: "FRED"` (`:267`). `context/alfred.ts` explicitly refuses that fallback | code |
| D4 | M | `sources-fred.ts:42-53` fetches current revised observations but keys events as `macro:<key>:initial:<ref>` (`:110`, `auto-ingest-types.ts:27-30`) | code |
| D5 | M | `measurement-provider.ts:132` hardcodes `"yahoo-finance2@3.14.0"`. `main` now installs `yahoo-finance2@^4.0.6` (#32), so any future measurement row or dry run would record the wrong client version. `candle-provider.ts:203` resolves the version at runtime | code, `package.json` |
| D6 | M | NYSE full-close table lacks **2025-01-09**, the national day of mourning (`sessionCalendar.ts:89-99`; the same gap is in `tests/fixtures/nyse-hours.json`). v4 refuses the 2025-01-10 NFP window (`incomplete_session_calendar`), which fails closed. **PR #43 is in flight** | code |
| D7 | M | The NYSE schedule exists only for 2022-01-01 → 2026-12-31 (`sessionCalendar.ts:26-29`). No session measurement is possible for 2018–2021 exploratory NQ sessions or for 2027 (PR #43 adds 2027) | code, [61](2026-11-27-phase-1-readiness/61-coverage-join.log) |
| D8 | M | Metric and stage vocabularies diverge:<br>• ALFRED labels the GDP first print `INITIAL`; the calendar uses `ADVANCE`.<br>• Context series use `macro:<SERIES>:level` keys with no `metricKey`, and have no PCE or DFEDTARU series (`context/definitions.ts:59-95`).<br>• Expectation fixtures use keys that aren't in the registry (`CPI_HEADLINE_MOM`, `INFLATION_BREAKEVEN_5Y`). | dry run, code |
| D9 | M | Legacy v2 writers are still live (`ingest.ts:241`, `auto-ingest.ts:295`, `backfill-prices.ts:237`), and `db:verify` measures only the v2 archive | code |
| D10 | m | Registry pointers marked `OPEN_PR` #31 although #31 is merged: `providers/fred.ts:163`, `providers/bls.ts:55`, `providers/sfFed.ts:22`. **PR #41 is in flight** | code |
| D11 | m | The registry has no BEA, Federal Reserve Board, Atlanta Fed or Philly Fed providers. `expectations/sources.ts` is a second source list. The NQ registry `envVars` omit `NQ_STRICT_ALLOWLIST_CSV` and related variables that `paths.ts` reads | code |
| D12 | m | Duplication:<br>• Four FRED HTTP clients: `fetch-macro.ts`, `sources-fred.ts`, `market-context/fred.ts`, `context/alfred.ts`.<br>• Two HTTP helpers: `release-calendar/polite-fetch.ts`, `market-context/http.ts`.<br>• Three sha256 helpers.<br>• The next-New-York-midnight availability rule is implemented twice under two policy ids: `alfred-ny-eod-v1` (`context/definitions.ts:21`) and `fred-vintage-ny-eod-v1` (`market-context/availability.ts:30`).<br>• Series keys are declared twice: `featureDefinitions.ts:18-20` and `series.ts:13-15`. | code |
| D13 | m | Five unmapped eligibility and quality vocabularies:<br>• NQ `strict/exploratory/refused`<br>• market-context `HistoricalReconstructionStatus`<br>• `MarketObservationQuality`<br>• macro `ObservationQuality`<br>• `actualProvenance` `VERIFIED_INSTANT/CONSERVATIVE_DATE_BOUND/UNRESOLVED`<br><br>Two different types are both named `Candle` (`types/market.ts`, `fetch-prices.ts`). | code |
| D14 | m | Orphans: seven `src/components/landing/*` components, including `PricingTable`; `market/sessionCalendar.internal.ts` (0 importers, 0% coverage but listed in coverage `include`); `smoke-alfred-live.ts` | [10](2026-11-27-phase-1-readiness/10-import-reachability.txt), [05](2026-11-27-phase-1-readiness/05-test-coverage.log) |
| D15 | m | `nqArchive/paths.ts:67` reads the root `certification-by-session.csv` (phase-2 schema) rather than the `phase3-v3.0.0/` copy beside the allowlists. Only `selected_contract` is used, and both files carry it | archive files |
| D16 | m | Stale docs:<br>• `docs/architecture.md` says Next 16.2.6 / Prisma 7.8. Its route table omits `/brief`, `/calendar` and `/quality` and describes `/` as the landing page. It never mentions `nqArchive`, calls the v4 backfill the "V3 writer", and has a duplicated `## Testing` heading.<br>• `CLAUDE.md` lists 3 active models (there are 5) and says lightweight-charts is unused (`MarketChart.tsx` uses it). | docs |
| D17 | m | Data hygiene:<br>• The Jackson Hole **speech** is typed `FED_DECISION` and carries a fed-funds `DataRelease`.<br>• The two GDP events are `MACRO_DATA` with no metric binding.<br>• The offline calendar run had FRED reconciliation `skipped` (no key), so cross-source reconciliation is not evidenced in this replay. | [20](2026-11-27-phase-1-readiness/20-db-snapshot.json), [30](2026-11-27-phase-1-readiness/30-calendar-offline-replay.log) |

## 7. Data coverage matrix

**Research eligibility** means usable for a no-lookahead event study under the project's own gates: official timing, a point-in-time-qualified actual, a pre-release expectation in canonical units, and a qualified market window. "Descriptive" means it can be displayed but not used in research.

| Source | Metric / series | Date range | Granularity | Location | Research eligibility |
| --- | --- | --- | --- | --- | --- |
| Fed Board FOMC pages | FOMC statement time | VERIFIED 92: 2008-10-08, 2010-05-09, then 2016-01-27 → 2026-10-28. DATE_ONLY 155: 1994-02-04 → 2015-12-16 | minute / date | local JSON (not in DB) | Timing-eligible (VERIFIED only); not wired |
| SF Fed workbook | FOMC times | SECONDARY_ONLY 131: 1988-02-04 → 2020-08-27 | per event | local JSON | Not timing proof |
| BEA news releases | GDP (advance / second / third) | VERIFIED 360: 1996-08-01 → 2026-10-29. SCHEDULED 14 to 2027-12-22 | minute | local JSON | Timing-eligible; not wired |
| BEA news releases | Personal income and outlays (PCE) | VERIFIED 358: 1996-07-01 → 2026-10-29. SCHEDULED 14 | minute | local JSON | Timing-eligible; not wired |
| BLS | CPI, NFP, PPI release timing | **none** | — | — | **Unavailable**: needs operator-saved BLS documents |
| Curated seeds (DB) | CPI 7 / NFP 5 / PPI 2 / FOMC 6 timing | 2022-07-13 → 2025-07-03 | minute | `events` | SCHEDULED, not publication proof. FOMC instants agree with the official calendar |
| Legacy actuals (DB) | CPI YoY, NFP MoM, PPI YoY, fed funds upper | 21 rows | per release | `data_releases` | Descriptive only. PIT: 0 / 21 (`qualifyLegacyActual`) |
| Legacy consensus (DB) | same | 20 values | per release | `data_releases` | UNVERIFIED, no source. **Ineligible** |
| ALFRED (fixtures) | CPIAUCNS Jun-2022 (vintage 2022-07-13); PAYEMS Jan-2023 (6 vintages through 2026-02-11); GDPC1 Q1-2023 (3 vintages) | as listed | per vintage | `tests/fixtures/alfred` | Fixture only; the provenance gate rejects all of them (B4) |
| ALFRED (live) | 4 series, TESTED in the registry | — | per vintage | not persisted | CONDITIONAL; nothing stored |
| PCE first prints | PCE, core PCE | **none** | — | — | **Unavailable** |
| Expectations (fixtures) | Archived-news CPI 2023-07 (the only VERIFIED as-of); Cleveland CPI and core PCE 2023-08 (DATE_ONLY); GDPNow 2023-Q2 (dated the same day); SPF CPI 2023-Q3 (`pct_saar`); T5YIE 2023-08-09 | as listed | per release | `tests/fixtures/expectations` | Fixture only; none matches a DB event. NFP, GDP and FOMC consensus: **unavailable** |
| Databento NQ 1m | NQ outrights | 2010-06-07 → 2026-10-06 | 1m | `$NQ_ARCHIVE_ROOT` | Strict: 11 sessions (2026 only). Exploratory: 1,336 (2018–2026). Tier C/D (2010–2017 and gaps): refused. Not connected to the engine |
| Yahoo candles (DB) | SPY, QQQ | 2024-09-09 → 2025-07-03 | 1h AS_TRADED | `candles` | Chart display only. No eligibility label; measurements don't read them |
| Yahoo-derived v3 measurements (DB) | 12 proxies × 4 measures | 2022-07-13 → 2025-07-03 | session close / 60m | `reaction_measurements` | Descriptive. Verifier FAIL (648 valid / 180 invalid / 132 missing); not PIT-certified |
| Recompute inputs (committed) | Yahoo daily, 12 × 20 events; 1h for 8 events | 2022-06-23 → 2025-08-02 | 1d / 1h | `docs/audits/2026-11-05-phase-0.5/` | Transformed adapter inputs, not raw payloads; not PIT |
| Cboe / Treasury / FRED market context | VIX, DGS2/10, T5YIE, DFEDTARU | fixtures 2024-01-02..05 only | daily | `tests/fixtures/market-context` | **Unavailable** for every event date |

### 7.1 Release × NQ session join (VERIFIED official timing only, [61](2026-11-27-phase-1-readiness/61-coverage-join.log))

| Family | Strict NQ | Exploratory, 2022+ (NYSE schedule known) | Exploratory, 2018–2021 (no NYSE schedule) | Refused (not on allowlist) | Outside the archive |
| --- | ---: | ---: | ---: | ---: | ---: |
| FOMC statement | **1** (2026-09-16) | 22 | 18 | 48 | 3 |
| BEA GDP | 0 | 41 | 22 | 131 | 166 |
| BEA PCE | 0 | 45 | 22 | 126 | 165 |
| CPI / NFP | — (no official timing) | — | — | — | — |

The 18 CPI/NFP/FOMC events in the DB fall on NQ sessions as follows ([62](2026-11-27-phase-1-readiness/62-db-events-nq-labels.log)):

| Family | Exploratory | Refused | Strict |
| --- | ---: | ---: | ---: |
| CPI | 5 | 2 | 0 |
| NFP | 3 | 2 | 0 |
| FOMC | 4 | 3 | 0 |

## 8. End-to-end dry runs (network-free, read-only)

The harness is [`scripts/e2e-dryrun.mts.txt`](2026-11-27-phase-1-readiness/scripts/e2e-dryrun.mts.txt), with output in [50 log](2026-11-27-phase-1-readiness/50-e2e-dryrun.log) and [50 json](2026-11-27-phase-1-readiness/50-e2e-dryrun.json). The JSON includes sha256 hashes of every input.

For each stage the harness calls the production module on what exists locally. A stage with no input reports **UNAVAILABLE** with a reason; no synthetic value is substituted. Test fixtures are labelled `FIXTURE`, never count as research input, and are never transformed into canonical headline values.

| Stage | CPI Jun-22 (07-13 12:30Z) | NFP Jan-23 (02-03 13:30Z) | GDP Q1-23 adv (04-27 12:30Z) | PCE Aug-23 (09-29 12:30Z) | FOMC (2024-09-18 18:00Z) | FOMC (2026-09-16 18:00Z) |
| --- | --- | --- | --- | --- | --- | --- |
| Official timing (calendar) | UNAVAILABLE (no BLS records) | UNAVAILABLE (no BLS records) | VERIFIED, instant matches | VERIFIED, instant matches | VERIFIED, matches DB | VERIFIED |
| DB timing | SCHEDULED | SCHEDULED | no Event | no Event | SCHEDULED | no Event |
| First-print actual | FIXTURE raw index; gate ✗ | FIXTURE raw level; gate ✗ | FIXTURE raw level; gate ✗ | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |
| Legacy actual (DB) | 9.1, PIT ✗ | 517, PIT ✗ | — | — | 5.00, PIT ✗ | — |
| Expectation | DB 8.8, UNVERIFIED; no fixture | DB 187, UNVERIFIED; no fixture | UNAVAILABLE | FIXTURE Cleveland nowcast 0.2 `pct_level` ≠ canonical `pct_yoy`; DATE_ONLY | DB 5.25, UNVERIFIED | UNAVAILABLE |
| NQ window (−30m/+60m) | 91/91 bars, NQU22, **exploratory** | 91/91, NQH23, **exploratory** | 91/91, NQM23, **exploratory** | 91/91, NQZ23, **exploratory** | 91/91, NQZ24, **refused** (`NOT_ON_ALLOWLIST`) | 91/91, NQZ26, **strict** (Tier A) |
| Reaction engine on NQ | REFUSED `undeclared_symbol` | REFUSED | REFUSED | REFUSED | REFUSED | REFUSED |
| DB candles | outside range | outside range | outside range | outside range | SPY/QQQ 1h in range | outside range |
| Context (VIX level) | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |
| v3 measurements | 36 rows, not PIT | 36 rows, not PIT | none | none | 36 rows, not PIT | none |
| Surprise | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |
| **Verdict** | **Not eligible** | **Not eligible** | **Not eligible** | **Not eligible** | **Not eligible** | **Not eligible** |

"Gate ✗" means `qualifyHistoricalActual` returned `missing_revision_evidence, missing_initial_release_evidence, unverified_availability`.

What the dry runs show:

- **Nearest to ready: FOMC 2026-09-16.** It has VERIFIED official timing and a strict, complete NQ window. It fails on three counts:
  - the engine can't measure NQ;
  - there is no point-in-time policy expectation (no fed-funds-futures or OIS source);
  - there is no persisted event.
- **CPI and NFP** are blocked first by BLS timing and second by expectations. Exploratory NQ windows exist.
- **GDP and PCE** have official timing and exploratory NQ windows. They have no DB events, no PIT-qualified actual and no pre-release consensus. PCE also has no first print at all.

## 9. Prioritized blockers

| Pri | ID | Blocker | Blocks | Needs |
| --- | --- | --- | --- | --- |
| P0 | B1 | No persistence for Phase 1 inputs and labels (D2) | Every link in §5 | Owner decision on the `ContextObservation` / snapshot / eligibility schema (additive migration, separately approved) |
| P0 | B2 | Phase 1 modules unwired (D1); calendar output unread | Any dry run against stored data | A read-only orchestration script that joins calendar → actual → expectation → market → measurement, before any writer |
| P0 | B3 | No qualified expectation for any event; NFP, GDP and FOMC consensus sources absent; PCE first prints absent | Every surprise study, which is the research thesis | A zero-cost consensus capture policy (the prospective collector exists but is in-memory only) and a market-implied FOMC source decision |
| P0 | B4 | The provenance gate rejects every ALFRED observation by construction (query-string URL rule; date-bound availability never upgraded by the calendar instant) | Point-in-time actuals | Align `hasEvidence` with redacted API URLs, or archive payloads under a stable URL, and define the calendar + vintage availability join |
| P0 | B5 | NQ cannot reach the engine: no session basis, no adapter, no label column. The strict universe is one release | Futures measurements; the stated purchase rationale for the archive | NQ session-basis declaration, an `IntradayBar` adapter, a CME daily-close definition, and a label carried end to end |
| P0 | B6 | Measurement qualification unchanged since Phase 0.5: 180 invalid, 132 missing, 75 unresolved v4 changes. Writes are frozen for every version | Any new measurement | The Phase 0.5 reconsideration items (§10) |
| P1 | B7 | BLS release timing unavailable | CPI and NFP studies | Operator-saved BLS documents (`--bls-dir`), at $0 |
| P1 | M1 | Silent current-vintage fallback and `:initial:` keys on revised data (D3, D4) | Trust in any newly ingested actual | Fail closed on fallback and re-key |
| P1 | M2 | Provider version hardcoded after the yahoo-finance2 v4 bump (D5) | Measurement provenance | Resolve the version at runtime, as `candle-provider.ts` does |
| P1 | M3 | NYSE calendar gap (2025-01-09) and the 2022–2026 window (D6, D7) | v4 NFP 2025-01-10; pre-2022 exploratory sessions | PR #43 (in flight) plus a pre-2022 schedule |
| P1 | M4 | Vocabulary and unit mismatches across calendar, ALFRED, context and expectations (D8); unit-blind `toConsensusEstimate` | Joins and surprise arithmetic | One metric/stage key and a unit check against `METRICS` |
| P1 | M5 | Measurement backfill re-fetches live and ignores preserved candles; candle preservation covers 2 of 12 symbols | Offline reproducibility | Read preserved inputs and preserve daily bars |
| P1 | M6 | Duplicate market series keys across providers are quarantined as conflicts | VIX and rates features once two providers are loaded | Provider-qualified keys or a precedence rule |
| P2 | — | D9–D17 hygiene: stale registry pointers (PR #41 in flight), registry gaps, duplicated helpers, orphan code, stale `architecture.md` / `CLAUDE.md`, legacy v2 writers, event typing | Auditability | Batch after the P0/P1 decisions |

## 10. GO/NO-GO

The criteria come from the [Phase 0.5 reconsideration list](2026-11-05-phase-0.5-remediation.md) and [roadmap R0/R1](../roadmap.md). The evidence is from this audit.

| Criterion | Status | Evidence |
| --- | --- | --- |
| Engineering checks (typecheck, lint, tests, coverage, schema, build) | **PASS** | §3 |
| Authoritative futures close/settlement and roll evidence, or an approved narrower universe | **NOT MET.** The NQ archive has roll evidence, but only 11 strict sessions, no settlement or close definition, and no engine path | §7, B5 |
| Missing-window evidence recovered or formally qualified | **NOT MET.** 132 missing, 0 legitimately unavailable | [40](2026-11-27-phase-1-readiness/40-measurement-replay.json) |
| 60 gold-futures changes and 15 first-hour observations reconciled | **NOT MET.** 75 unresolved | [41](2026-11-27-phase-1-readiness/41-recompute-replay.log) |
| v4 inputs archived; additive persistence and replay validated on isolation | **NOT MET.** The writer still fetches live; no isolated apply | §5 |
| Qualified macro observation/evidence boundary and source workflow | **NOT MET.** The contract exists, but ALFRED cannot pass it and nothing persists | B1, B4 |
| R1: point-in-time eligibility explicit, with no silent latest-vintage promotion | **NOT MET** in the live ingest path | D3 |
| R1: v3 / current-version catch-up workflow | **NOT MET.** Writes frozen for all versions; legacy v2 writers active | §5, D9 |
| Release timing from official sources | **PARTIAL.** FOMC, GDP and PCE are VERIFIED offline but unwired; CPI and NFP unavailable | §7 |
| Consensus / forecast source (CLAUDE.md's highest-value item) | **NOT MET** | B3 |

**Decision: NO-GO.** Phase 1 implementation against stored data, historical context backfill, surprise studies, v4 cutover and any backtest stay unauthorized.

Work that can proceed without changing this decision:
- P1 fixes (M1–M6) and P2 hygiene, each as its own PR.
- A read-only orchestration dry-run script that consumes the local calendar and NQ archive and writes JSON to a scratch path. This extends §8 and does not touch the database.
- A schema design proposal for B1, presented as a document for review and **not** applied.

A narrower, explicitly labelled "exploratory" universe is possible. It would cover FOMC, GDP and PCE 2022+ on Tier B NQ sessions, with reactions only and no surprise. It needs an owner decision; this audit does not authorize it.

## 11. In-flight work not evaluated

These PRs opened while the audit was running and are **not** on `bcf0ba1`. They were not reviewed:

- #36 orchestration backlog docs
- #37–#39 Dependabot
- #41 registry licensing and MAIN pointers (overlaps D10)
- #43 NYSE 2025-01-09 and 2027 schedule (overlaps D6, D7)
- #44 macro metric transforms

The dependency bumps in #32 (merged) include major versions: `yahoo-finance2` 3 → 4, `framer-motion` 12 → 14, `@anthropic-ai/sdk` 0.95 → 1.13. Tests and build pass. D5 is the one research-relevant consequence found.

## 12. Reproduction

Commands are run from a clean checkout of `bcf0ba1` after `npm ci && npm run db:generate`. `$SCRATCH` is any empty directory and `$E` is the evidence output directory.

```sh
# Verification (CI sequence)
npm run typecheck && npm run lint && npm run test:coverage && npm run db:validate
env -u DATABASE_URL -u DIRECT_URL npm run build
npm audit --omit=dev

# Registry audit (static metadata; no network)
node --import tsx scripts/maintenance/audit-data-sources.ts

# Release calendar, offline replay from an existing raw cache (no keys in env)
cp -R "$CALENDAR_WORKTREE/data/release-calendar/cache" "$SCRATCH/calendar-replay/cache"
env -u FRED_API_KEY -u BLS_API_KEY node --import tsx scripts/ingest/release-calendar/build.ts \
  --offline --out "$SCRATCH/calendar-replay"   # expect records.json sha256 e9679876…26e9

# Measurement replays (expected exit 1: qualification gate retained)
node --import tsx scripts/maintenance/verify-reaction-measurements.ts \
  --snapshot docs/audits/2026-11-05-phase-0.5/measurement-snapshot.json --report "$E/40.json"
node --import tsx scripts/maintenance/recompute-reaction-impact.ts \
  --snapshot docs/audits/2026-11-05-phase-0.5/measurement-snapshot.json \
  --inputs docs/audits/2026-11-05-phase-0.5/recomputation-inputs.json --report "$E/41.json"

# End-to-end dry runs, coverage join and DB-event NQ labels
# (copy scripts/*.txt to $SCRATCH without .txt first)
WT="$PWD" SP="$SCRATCH" MAIN_SHA=$(git rev-parse HEAD) NQ_ARCHIVE_ROOT=... \
  node --import tsx "$SCRATCH/e2e-dryrun.mts"
WT="$PWD" SP="$SCRATCH" NQ_ARCHIVE_ROOT=... node --import tsx "$SCRATCH/coverage-join.mts"
WT="$PWD" SP="$SCRATCH" NQ_ARCHIVE_ROOT=... node --import tsx "$SCRATCH/db-events-nq.mts"
```

The DB snapshot ([`scripts/db-snapshot.ts.txt`](2026-11-27-phase-1-readiness/scripts/db-snapshot.ts.txt)) needs a DB URL and uses `createDryRunPrismaClient`, which forces read-only at the connection. It issues SELECT and SHOW statements only.

The audit scripts are committed as `.txt` files so they stay out of `tsc` / `eslint` scope (the `**/*.mts` include). They are evidence, not product code.

## 13. Evidence manifest

See [`MANIFEST.sha256`](2026-11-27-phase-1-readiness/MANIFEST.sha256). Each log ends with its command's exit code.
