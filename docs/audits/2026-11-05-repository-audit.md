# ImpactFeedAI V2 repository audit

Audit date: November 5, 2026, America/New_York. Repository baseline:
`3fe158504a22f765105e2a0aa7697bccaa3d7acc`. The worktree was clean at the start.

## Decision

The existing application is a useful event-research foundation, but **Phase 1
implementation is gated by reproducible integrity defects**. Complete the
remediation milestones in [the roadmap](../roadmap.md) before publishing or
backfilling point-in-time context. This audit does not authorize a production
repair, calculation-version cutover, or destructive migration.

The first deliverable is complete: this audit, the corrected
[architecture and proposal](../architecture.md), the prioritized
[roadmap](../roadmap.md), and the concrete [Phase 1 plan](../phase-1-market-context-plan.md).
No application code, dependencies, migration files, environment variables, or
production records were changed for this deliverable.

## Evidence and limits

The audit inspected application routes, query/mapping services, analytics,
Prisma schema and all four migrations, ingestion and backfill writers,
maintenance tools, tests, CI, documentation, and recent commit history.

Database credentials were available. After an initial sandbox DNS failure,
the configured database was reached successfully. Aggregate/catalog queries
ran inside a **repeatable-read, read-only transaction**, confirmed by
`SHOW transaction_read_only = on`, and ended with `ROLLBACK`. The evidence
snapshot was taken at `2026-11-05T21:31:06Z` (16:31 EST). The configured endpoint
was audited; its production/development branch identity was not independently
confirmed through a Neon control-plane login.

Evidence files are in [2026-11-05/](2026-11-05/):

- [Database snapshot](2026-11-05/database-snapshot.json): aggregate coverage,
  migration checksums, column/index/constraint catalogs; no connection strings.
- [Read-only queries](2026-11-05/database-queries.sql): queries behind the snapshot.
- [Validation results](2026-11-05/validation.txt): command outcomes and verifier output.
- [Calendar reproduction](2026-11-05/calendar-reproduction.md): executable
  synthetic examples and the observed output, independent of the database.

No new provider ingestion, repair, backfill, migration deployment, browser E2E
run, or independent price-by-price reconciliation was performed. A provider
reference-calendar check is narrower than external reconciliation of every
stored price. Passing the existing verifier does not certify its untested
assumptions.

## 1. Architecture actually present

| Layer | Observed implementation | Assessment |
| --- | --- | --- |
| Application/backend | Next.js 16.2.6 App Router, React 19.2, strict TypeScript; server components and GET route handler | Complete event-research foundation; **no FastAPI or Python backend found** |
| Database | Prisma 7.8 client with `@prisma/adapter-pg`, PostgreSQL configured through Neon URLs | Connected and inspected; five application tables plus migration ledger |
| Presentation | `/`, `/feed`, `/events/[id]`, `/patterns`; shared UI tokens/primitives, SVG reaction charts, lightweight-charts candlesticks | Built; no macro overview, research lab, analog explorer, or AI workspace |
| Event reads | `eventQueries.ts` → `mapEvent.ts`; version/timing gates; parameterized SQL ranking | v3 read cutover present; no application `prisma.assetReaction` read found |
| Reaction engine | Pure `reactionMeasurement.ts`, explicit measures, price/session bases, canonical session calendar | Built and tested, subject to findings below |
| Candle store | Reusable OHLCV table, basis/version filtering, ingestion adapters, DB-backed chart | Built; live coverage is sparse, not a continuous historical context series |
| Macro ingestion | Curated ingestion, FRED/BLS generators, DFEDTARU-change FOMC generator, metric/unit registry | Code exists; live database has only the small curated-looking set, not broad bulk coverage |
| Analytics | `patternAnalysis.ts`: per-measure mean, median, range, positive/negative/flat counts, observations and distributions | Descriptive only; broader Phase 2 statistics absent |
| AI | Anthropic SDK declared; no active model calls or AI routes found | Missing; no existing grounded analyst to extend |

The instrument universe is **SPY, QQQ, IWM, TLT, GLD, GC=F, CL=F, DX-Y.NYB,
BTC-USD, XLE, XLF, XLK**. SPY/QQQ are ETF proxies; ES, NQ, the S&P cash
index, VIX, and Treasury yield series are not in this universe. TLT returns
are not Treasury yields. Futures continuous-series roll methodology is not
documented in the measurement rows.

## 2. Latest reaction-engine changes

The September 12 sequence establishes the current baseline, superseding the
v2 descriptions still present in older documentation:

| Commit | Change |
| --- | --- |
| `55c742c`, `aaeb4d4` | Canonical reference calendar and release-session resolution |
| `01ed4e7`, `1b63470` | Additive `reaction_measurements` migration; separate current v3 and archived v2 constants |
| `b5639e6`, `08a471d` | Session and intraday calculation families |
| `2fdfab4`, `a18924e` | Basis-declared Yahoo provider and additive, dry-run-default v3 backfill |
| `b0a9312`, `fb65475` | BTC bar-derived economic-close correction and pre-release price-availability validation |
| `5c6d8b1`, `380e3ef` | Family-specific verifier and further invariant checks |
| `2871844` | Production reads, ranking, aggregates, API, and four-measure UI cut over to v3 |
| `3fe1585` | Verifier `main()` runs only on direct invocation; importing its checker no longer runs a database CLI |

The four windows must remain separate:

| Measure | Anchor and endpoint | Live rows | Distinct events |
| --- | --- | ---: | ---: |
| `INTRADAY_60M` | Latest usable intraday **open** strictly before release, at most 2h old; first usable open at/after release +60m, at most 2h beyond target | 108 | 9 |
| `RELEASE_SESSION` | Prior canonical session close → release-session close | 240 | 20 |
| `SESSION_PLUS_1` | Same prior-session close → close one canonical session after release session | 240 | 20 |
| `SESSION_PLUS_5` | Same prior-session close → close five canonical sessions after release session | 240 | 20 |

The session origin is the first canonical SPY session whose close is strictly
after the release. Cross-instrument dates follow that calendar, while
`US_EQUITY_RTH`, `EXTENDED_FUTURES`, and `CONTINUOUS_24_7` disclose different
native trading structures. This is not a full native-exchange calendar for
every instrument. Intra-session release-session returns include trading
before the release. Missing measurements are absent rows, never zeros.

## 3. Validation performed

| Check | Result | Interpretation |
| --- | --- | --- |
| `npm run verify` | PASS: typecheck, lint, **29 test files / 518 tests** | Reverified; no longer just a historical claim |
| `npm run db:validate` | PASS | Local Prisma schema/config valid |
| `npm run build`, restricted network | FAIL fetching IBM Plex Google Fonts | Environment/network failure; no source workaround introduced |
| `npm run build`, network enabled | PASS | Prisma generate, Turbopack compilation, TypeScript, static generation and route build complete |
| Existing candle verifier, DB writes disabled | PASS, **10/10 invariants**, 1,276 candles | OHLC/basis/version/volume checks; not proof of complete coverage or correct early-close sessions |
| Existing reaction verifier, DB writes disabled | PASS, **828 rows, zero reported violations**, no skipped-event output | Reference-calendar checks completed in this run; limitations in finding I2 remain |
| `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`, DB writes disabled | PASS, **no difference detected** | Read-only comparison within Prisma's schema-diff scope |
| Additional SQL integrity checks | PASS for checked predicates | Zero ineligible-timing measurement rows, invalid numeric rows, arithmetic mismatches, or intraday bound violations |
| Synthetic calendar probes | **Defect reproduced on three dates** | Existing unit tests do not cover these false early closes |
| Browser/component/E2E checks | Not run | Historical commit reports are not fresh browser validation |

The reaction verifier reported 108 intraday endpoints with release-relative
elapsed times min/median/max **60/60/90 minutes**. The code allows endpoints up
to 180 minutes after release (60-minute target plus 120-minute slip). The
pre-release anchor can also be up to 120 minutes old. Do not describe every
stored first-hour return as exactly 60 minutes of price-to-price exposure.

## 4. Database schema and migration status

All four local migrations appear in the live ledger, have a completion
timestamp, have no rollback timestamp, and match the SHA-256 checksum of the
local migration file. No pending local migration was found:

1. `20260512194452_init`
2. `20260810231105_add_event_timing_provenance`
3. `20260820185236_add_candle_storage`
4. `20260912175823_add_reaction_measurements`

Observed tables and constraints agree with the inspected model structure:

| Model/table | Count | Relevant identity and limitations |
| --- | ---: | --- |
| `Event` / `events` | 50 | Unique event key plus `(headline, occurredAt)`; separate exact time, date, timing status/source |
| `DataRelease` / `data_releases` | 21 | Unique `(eventId, metricName)`; one current shaped value, **no revision/availability history** |
| `AssetReaction` / `asset_reactions` | 597 | v2 archive used by legacy tools, not live UI reads |
| `Candle` / `candles` | 1,276 | Unique symbol/interval/open/basis; fetched/version metadata; no append-only historical revision identity |
| `ReactionMeasurement` / `reaction_measurements` | 828 | Unique event/symbol/measure/calculationVersion; prices, bar stamps, session days, provider, fetched timestamp |

Unique indexes, foreign keys, non-null columns, and query indexes are present
in the saved catalog. There are no application-table SQL `CHECK` constraints
for finite positive prices, arithmetic, or temporal ordering; those are
application/verifier responsibilities. A subsequent read-only Prisma schema
diff also reported no difference between the configured datasource and
`prisma/schema.prisma`. No clean database migration replay was performed;
Prisma's supported schema comparison is not proof of every possible database
property or data invariant.

## 5. Actual data coverage

### Events and release timing

| Event type | Events |
| --- | ---: |
| Tariff | 11 |
| Fed decision | 7 |
| CPI | 7 |
| PPI | 2 |
| NFP | 5 |
| Geopolitical | 8 |
| Earnings surprise | 7 |
| Other macro data | 3 |

Twenty events have `SCHEDULED` timing with non-null exact timestamps and named
sources. Thirty have `UNVERIFIED` timing and no exact release timestamp or
publication date. No `VERIFIED`, `REFERENCE_PERIOD_ONLY`, `DATE_ONLY`, or
`INFERRED` status rows are currently stored. Timing eligibility is a metadata
gate; this audit did not revisit all 20 official source documents to confirm
actual versus scheduled publication instants.

The 20 timing-eligible releases span **July 13, 2022 to July 3, 2025**. The
latest recorded display/occurrence date in the whole event table is February
24, 2026; that event has no verified exact release time. The current dataset
cannot support a current November 2026 macro overview or an upcoming calendar.

### Actuals, forecasts, surprises and vintages

All 21 `DataRelease` rows have actuals. **All 21 lack `metricKey`,
`referencePeriodStart`, `actualSource`, and `actualSourceUrl`.** Their metric
names identify 7 headline CPI, 7 Fed-target, 5 payroll, and 2 headline PPI rows.
The code supports more metrics than the live dataset contains: no identified
PCE, GDP, unemployment, JOLTS, core inflation, or sentiment release rows were
found.

Twenty have numeric forecasts and stored surprises, all `UNVERIFIED`, without
complete consensus provenance. One forecast is `MISSING`. **Verified consensus
count is zero.** The SQL check for malformed verified forecasts therefore has
no positive eligible examples to exercise. Standardized-surprise studies are
currently data-blocked, not merely missing a z-score function.

No per-observation publication, availability, or vintage timestamp can be
recovered from this schema alone. `Event.createdAt` is an insertion timestamp,
not an actual's historical publication time. Correct-looking values are not
evidence that they are first prints.

### Prices, candles and reactions

Every one of the 12 symbols has 20 observations for each of the three session
measures and 9 for first hour. All 20 eligible events have session measures;
11 have no first-hour rows. The other 30 events are intentionally outside
reaction eligibility. Thus 828 rows represent only **20 events**, not 828
independent macro experiments.

Candles contain **638 SPY + 638 QQQ hourly as-traded bars**, ingestion version
1, spanning September 9, 2024 through July 3, 2025. The span is not proof of
continuous coverage: backfill stores windows around events. No other symbols,
daily bars, or finer intervals are stored. Of 1,276 bars, 726 extended-hours
volumes are null, as intended. Latest candle fetch is August 20, 2026.

Reaction backfill fetches source series separately from the persisted candle
store. A reaction row does not imply that its complete input bar series is
archived. Existing bars cannot supply 200/252-session equity lookbacks or a
historical realized-volatility panel. There are no stored VIX/yield context
series, context snapshots, or regimes.

## 6. Integrity findings and implementation gates

### I1 — High: false equity early closes can introduce lookahead

Location: `src/services/market/sessionCalendar.ts:31–36`; downstream anchor
guard in `reactionMeasurement.ts` uses the resulting economic close.

The table marks **2022-07-01, 2022-12-23, and 2026-07-02** as 13:00 closes.
Those are not equity early closes in the corresponding official NYSE
schedules. The historical schedules list the actual exceptional closes:
[2022–2024 NYSE announcement](https://ir.theice.com/press/news-details/2021/NYSE-Group-Announces-2022-2023-and-2024-Holiday-and-Early-Closings-Calendar/default.aspx),
[2026–2028 NYSE announcement](https://ir.theice.com/press/news-details/2025/NYSE-Group-Announces-2026-2027-and-2028-Holiday-and-Early-Closings-Calendar/default.aspx).

Executed probes place a 14:00 ET release on each disputed day. All resolve to
the next session rather than the same day's 16:00 close. A second probe shows
a July 1, 2022 daily **16:00** close accepted as a pre-release anchor for a
**14:00** release, because the table claims it was known at 13:00.

Live exposure query found no current event release, anchor-session, or
release-session on those three dates. That bounds current measured exposure;
it does not make the calculator safe for broader historical backfill. The
existing reaction verifier shares this table and cannot independently detect
its wrong hours.

Gate: correct the source-backed calendar, add positive and negative calendar
fixtures and this anchor regression, then follow the existing reaction spec
§6.3 **calculation-version bump** rule for historical calendar changes. Plan
an additive recomputation and verify before switching live reads. Do not edit
stored v3 rows in place or silently change their interpretation.

### I2 — High: verifier success does not require complete verification

Location: `scripts/maintenance/verify-reaction-measurements.ts`, event loop and
final exit decision. A null release timestamp or a failed reference-calendar
fetch prints `SKIPPED` and continues without incrementing a failure or
incomplete counter. Final success depends only on violation count. All events
could be skipped while the command still exits successfully. This is a
code-inspection finding; this audit's successful live run had no skips.

Additional coverage gaps: the checker validates supplied session adjacency and
offsets but does not independently prove that `releaseSessionDay` is the
correct release-session resolution; it shares the calculator's close table.
The CLI does not gate event timing status/source. The separate audit SQL found
zero currently ineligible measurement rows.

Gate: report total/checked/skipped/invalid counts, make incomplete verification
non-successful in strict mode, validate event eligibility and session origin,
test provider failures/null timestamps/zero coverage, and use independent
official-hour fixtures. Retain explicit per-family invariant semantics.

### I3 — High for historical macro context: vintage identity is lost

`DataRelease` cannot store successive revisions or when each actual became
available. Curated `fetch-macro.ts:315–329` requests a day-level ALFRED vintage
but falls back to latest values when that response is empty; the fallback is
only logged and is not persisted as a quality/vintage distinction. The bulk
FRED/BLS generators consume current observations, and the bulk event key calls
them `initial` even though the source response does not prove a first print.
The release schema cannot distinguish these cases afterwards.

FRED documents that default real-time periods represent today's knowledge and
that historical real-time parameters change the information set; dates are
day-level, not an intraday publication clock.
[FRED real-time documentation](https://fred.stlouisfed.org/docs/api/fred/realtime_period.html),
[observations endpoint](https://fred.stlouisfed.org/docs/api/fred/series_observations.html).

Gate: an append-only context-observation contract with explicit vintage and
availability evidence; unknown/revised-latest fallback stays ineligible for
historical pre-release features. Legacy release rows remain visible with their
existing caution labels. Do not reconstruct their first print from current
values or infer missing reference periods from headlines.

### I4 — Medium: new-event writers still target the v2 archive

`ingest.ts:241`, `auto-ingest.ts:295`, and `backfill-prices.ts` write
`AssetReaction` rows stamped version 2. Production readers use only
`ReactionMeasurement` version 3. The v3 backfill exists as a separate manual
step; no scheduler or automatic v3 catch-up orchestration was found. New
eligible events can therefore appear with no live reactions despite the
legacy ingestion reporting successful asset writes. The archive is frozen
for v3 work by design, but is not technically immutable to old commands.

Gate before scaling ingestion: define a v3-only writer/catch-up workflow and
integration fixture, explicitly quarantine legacy write commands, retain the
597 existing archive rows. Do not use v2 as a UI fallback.

### I5 — Medium: current operational checks overstate their scope

`db:verify` counts the v2 archive and its 12-asset coverage, not the live
measurement table. The model-operation dry-run guard does not intercept raw
SQL execution; its source notes this limitation. Existing backfills use
`skipDuplicates`, preserving prior rows but also preventing an implicit
revision/version refresh under the same natural key. Macro repair tooling can
update legacy actuals and must not become an automatic point-in-time pipeline.

Gate: v3-aware diagnostics, connection-level read-only enforcement for audits,
explicit schema/version transitions, and append-only revision handling. The
audit used database-level read-only transactions rather than relying solely
on the Prisma model guard.

## 7. Complete / partial / missing assessment

| Capability | Status | Evidence or next dependency |
| --- | --- | --- |
| Search, event detail, cross-asset comparisons | Complete foundation | Existing DB-backed routes and tests |
| Four-window reaction measurement/read cutover | Complete foundation with blocking calculator/verification defects | 828 current rows; I1/I2 |
| Provenance, null handling, calendar and basis separation | Partial | Strong contracts and UI disclosure; legacy actual provenance absent and calendar defects remain |
| FRED/BLS/FOMC ingestion | Partial | Adapters exist; sparse live history; FOMC rate-change source omits holds and infers timing |
| Authoritative release calendar | Partial | Contract, seed citations, promotion tooling; no bulk authoritative adapter found |
| Verified historical consensus | Missing operational coverage | Provider boundary exists; zero verified live rows |
| Candle archival and displayed paths | Partial | Schema, adapter, chart and checks built; only two symbols/event windows stored |
| VIX, Treasury yields, equity lookbacks | Missing | No normalized context series or sufficient stored input history |
| Point-in-time regimes | Missing | Need I1–I3 gates and the Phase 1 contract |
| Conditional means/medians/frequencies/distributions | Partial | Existing descriptive patterns; category-level grouping is too coarse for indicator research |
| Standard deviation, quantiles, bootstrap intervals, baseline effects, sensitivity, multiplicity, walk-forward/OOS | Missing reusable research layer | Phase 2 after context and data coverage |
| Historical similarity and baseline evaluation | Missing | Phase 3; no embeddings needed initially |
| Five-view quantitative dashboard | Mostly missing | Reuse event UI; add data-backed views in Phase 4 |
| Grounded reproducible AI analyst | Missing | Phase 5; approved queries/statistical tools first |

## 8. Documentation and roadmap reconciliation

The previous roadmap marked candle storage missing, described ranking over
`asset_reactions`, and deferred statistical rigor until after an AI interface.
The previous architecture/README still mixed v2 fixed-column windows with
current v3 behavior and described installed charting as unused. These conflict
with code and recent history. Documentation is updated with this audit and
the V2 dependency order; the reaction contract and historical cutover plan
remain historical design records, not proof that all current data is valid.

Phase 1 should extend the existing TypeScript/Prisma/services architecture.
There is no evidence supporting a FastAPI rewrite, new chart stack, or ML
regime model. Begin with the explicit integrity gates, then independently
testable observation selection, feature calculations, persistence/ingestion,
snapshots, and a small event-context integration. Detailed files, models,
formulas, units, and acceptance tests are specified in the linked Phase 1 plan.
