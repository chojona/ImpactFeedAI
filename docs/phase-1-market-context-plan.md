# Phase 1 — point-in-time market context implementation plan

Status: **proposed, not implemented**. The [November 5 audit](audits/2026-11-05-repository-audit.md)
found blocking integrity defects. Milestones P1.1 onward start after roadmap
integrity gates R0/R1 are satisfied. This plan supplies concrete implementation
choices and acceptance criteria without altering production data.

## Objective and boundaries

Given an explicit cutoff, return the economic/market information demonstrably
available before that cutoff, deterministic continuous features and regime
labels, exact input references, and reasons for unavailable features. An
event's pre-release context uses **strictly before `Event.releaseAt`**;
date-only/untrusted event timing cannot anchor an event context snapshot.

Preserve the four reaction measures, their per-instrument session bases, the
live version gate, and the v2 archive. Reactions are outcomes, never context
inputs. No statistics, analog search, AI calls, predictive labels, new backend
service, or dashboard redesign belongs in Phase 1.

## 1. Observation and time contract

An observation is a value **plus** its identity, units, revision identity,
temporal semantics, and provenance. Missing timing is explicit; it is not
midnight and not the reference period.

| Field | Definition / rule |
| --- | --- |
| `seriesKey`, provider series ID | Stable metric/instrument identity; keep units, frequency, adjustment and session basis in the series definition |
| `observationAt` / period start/end | When the market observation occurred, or the economic period measured; a macro period is not a release instant |
| `sourceAt` | Provider's own timestamp/as-of, if supplied; nullable and precision-qualified |
| `publishedAt`, publication date and precision | When this specific revision was published; null exact timestamp if only a date is supported |
| `availableAt` | Earliest **defensible** usable instant under a named/versioned availability policy, with evidence; null if unverifiable |
| `fetchedAt` / `recordedAt` | Retrieval and system insertion times; never substituted for historical publication |
| `vintageKey`, `vintageDate`, release stage | Revision identity, distinct from observation period; distinguish initial/advance/second/third/revision/unknown |
| `value`, unit | Finite normalized number or explicit missing status; preserve raw source value too |
| source URL, payload hash, ingestion version | Traceable source response/evidence; redact API keys from all persisted/logged URLs |
| quality/status | `verified`, `conservative_date_bound`, `unknown_availability`, `revised_latest`, `missing`, `conflict`, etc.; historical eligibility is explicit |

Two knowledge modes must be explicit in the query and cache key:

- **System replay:** requires both source availability and local receipt before
  cutoff. Backfilled data fetched in 2026 cannot impersonate what this app knew
  in 2022.
- **Historical public-information reconstruction:** may use evidence retrieved
  later only if an archived vintage and publication/availability evidence prove
  what the public knew at cutoff. Include a fixed `recordedThrough` data-freeze
  instant, source-evidence references, and reconstruction policy in the output.
  Present it as reconstructed history, not an actual prior system snapshot.

For exact release contexts use `availableAt < cutoff`, never `<=`. Choose the
latest eligible revision **within each observation period**, then choose the
period(s) the feature requires. A later revision of an older period must not
replace a more recent reference period as the latest economic observation.
Reject future observation intervals and incomplete market bars too. A bar's
open stamp does not make its close/high/low available at its open.

Daily ALFRED vintage dates do not establish an 08:30 publication instant. If
only a trustworthy publication/vintage **date** is known, an optional
conservative policy can bound availability to after that date ends in the
documented source timezone; keep exact `publishedAt` null and label that bound.
If the date itself does not prove availability, exclude the observation. Never
assign conventional macro release hours without independent timing evidence.
Same-day date-only observations cannot enter same-day pre-release features.

No unlimited forward-fill. Store input age and last observation date; daily
market values older than 7 calendar days fail the initial freshness policy.
Paired features require the same observation dates and compatible units and
bases. Monthly/quarterly macro freshness must follow the series frequency and
publication schedule; initial maximum ages are 75/150 calendar days from
reference-period end, with a `stale` result outside those bounds. These are
versioned operational defaults, not estimates of economic relevance.

## 2. Small additive data model

Keep the existing five models. Introduce these incrementally with a new Prisma
SQL migration after R0, using a disposable database/isolated Neon branch for
migration validation; do not deploy to the configured live endpoint as part
of local development.

| Proposed model | Contents / identity |
| --- | --- |
| `ContextSeries` | Canonical series key; provider/source ID; unit/frequency/timezone; market/macro kind; calendar/session and price/adjustment convention; definition version and citation |
| `ContextObservation` | Immutable value/revision and all time/provenance fields above; FK to series; optional existing event/release link; raw-response evidence hash |
| `MarketContextSnapshot` | Optional event FK; cutoff, knowledge mode, data freeze, feature/rule version, configuration and input fingerprint, computed timestamp; immutable output envelope |
| `ContextFeature` | FK to snapshot; feature key, numeric or categorical value, unit, status/reason, source/observation/publication/availability metadata summary and input count |
| `ContextFeatureInput` | Feature → observation FK edges, preserving every input and transform role, including lookback/denominator inputs |

Observation natural identity: series + observation period + provider vintage
key (including release stage/basis when meaningful). An identical payload is
idempotent. A conflicting payload under the same purported immutable revision
is quarantined and reported; it must not be silently overwritten or chosen by
last-write-wins. An actual new revision is a new row. Where the provider has
no immutable revision key, an observation can be stored as a retrieval snapshot
but cannot be assigned verified historical-vintage status.

Indexes must support series/period/revision selection and series/availability
cutoffs. Snapshot identity includes cutoff, knowledge mode, data freeze,
definition/rule/configuration versions and selected-input fingerprint; use a
unique key to make deterministic recomputation idempotent. Preserve old
snapshots when observations, definitions, or evidence improve.

Use database checks for finite numbers and coherent required timestamp pairs
where practical; cross-row historical selection remains a pure tested service.
Use immutable observation foreign keys rather than trusting an unvalidated
JSON list of input IDs. Missing results have a status/reason and null value;
an empty sample cannot become a zero. Feature lineage includes every input's
own timestamps, not one artificial timestamp applied to a whole vector.

## 3. Source plan

| Family | First source/input | Availability requirement / limitation |
| --- | --- | --- |
| VIX | FRED `VIXCLS`, daily closing index | Archive source/vintage metadata; no claim of an intraday live VIX feed |
| Treasury rates | FRED `DGS2`, `DGS10`, daily percentages | H.15/FRED dissemination timing is distinct from quote observation date; do not assume availability at equity close |
| Equity prices | Daily SPY, QQQ, IWM and other existing proxies through provider seam | Archive consecutive completed sessions with declared adjustment basis; current candle windows are insufficient |
| Inflation | Canonical CPI/core CPI/PCE/core PCE source series | Archived revision + sourced release timing; current `DataRelease` legacy rows are not eligible input |
| Labor | PAYEMS, UNRATE | Preserve reference periods and vintage-consistent transforms |
| Growth | GDPC1 and estimate-stage provenance | Advance/second/third estimates are distinct; never backdate a revised GDP value |
| Policy path | DFEDTARU/target-range observations with announcement evidence where required | Realized target changes can describe direction; do not call them market expectations |
| Policy expectations | No initial adapter | Explicit `unavailable_no_historical_source`; require validated historical futures/OIS methodology before adding |
| Surprise | Verified pre-release consensus + proven initial actual | Currently zero qualified live consensus rows; unavailable until coverage exists |

Series definitions were checked against [VIXCLS](https://fred.stlouisfed.org/series/VIXCLS),
[DGS2](https://fred.stlouisfed.org/series/DGS2), and
[DGS10](https://fred.stlouisfed.org/series/DGS10) on November 5, 2026. These
definitions do not by themselves provide historical intraday availability or
redistribution rights. Preserve source attribution and applicable series
terms; there is no provider purchase or hosting change in this plan.

Do not fetch providers during web rendering. Provider adapters live in
`scripts/ingest/`, pure feature logic in `src/services/context/`, and database
reads/materialization in separate context services. Reuse the macro unit/time
registry and provider seams; do not reuse historical reaction endpoints as
daily market inputs.

## 4. Version 1 feature definitions

These are proposed deterministic research defaults. Thresholds and lookbacks
are configurable, versioned, and later subject to Phase 2 sensitivity checks;
they have no established predictive validity. Insufficient or incompatible
inputs yield explicit missing status and no regime label.

Let `P[t]` be the last completed eligible daily closing observation in one
declared price basis. A k-session return needs k+1 consecutive eligible closes
on the series' own calendar. No interpolation of missing sessions.

| Feature | Definition | Unit and eligibility |
| --- | --- | --- |
| VIX level | Latest eligible daily closing VIX | Index points; include observation date/age |
| VIX percentile | `100 * count(prior VIX <= latest VIX) / n` over the preceding 252 source observations, excluding latest | Percentile 0–100; require all 252 preceding observations; deterministic tie rule |
| Volatility regime | Percentile <20 low; >=80 elevated; otherwise normal | Category; no classification without valid percentile |
| Realized volatility 20/60 | Sample standard deviation (`ddof=1`) of log daily close returns over 20/60 complete sessions, multiplied by `sqrt(252)*100` for equities | Annualized percentage points; separately use 365 for daily 24/7 series; never pool annualization conventions |
| Implied minus trailing realized | VIX level minus SPY RV20 | Annualized volatility-point spread; same end date, explicit backward/forward horizon mismatch; not a variance-risk-premium estimate |
| 2y / 10y level | Latest same-date eligible DGS2 / DGS10 | Percent, not ETF return |
| 2s10s | `100 * (DGS10 - DGS2)` | Basis points; same source observation date |
| Yield changes 5/20 | `100 * (yield[t] - yield[t-k])` on Treasury source business dates | Basis points; require aligned complete date grid, no calendar-day substitution |
| Curve regime | Spread <0 inverted; otherwise non-inverted | Category; retain spread continuously |
| Equity returns 5/20/60/252 | `100 * (P[t]/P[t-k] - 1)` | Percent; basis-consistent closes and complete calendar |
| Equity trend | Bullish if `P[t] > SMA50 > SMA200`; bearish if `P[t] < SMA50 < SMA200`; otherwise mixed | Category; require 200 completed sessions; equality is mixed |
| Drawdown 252 | `100 * (P[t]/max(last 252 closes including t) - 1)` | Percent, <=0; rolling-window high, not all-time high |
| Relative strength 20/60 | Instrument simple return minus benchmark SPY return at identical start/end instants | Percentage points; compatible basis/currency; missing if endpoints/market conventions cannot align |
| Inflation direction | Latest YoY inflation minus same-metric YoY three monthly observations earlier; >+0.1pp accelerating, <-0.1pp decelerating, otherwise stable | Difference in percentage points; all inputs selected from eligible vintages |
| Inflation persistence | Number of positive monthly changes in that same YoY measure over the last six transitions; report negative/zero counts too | Count 0–6; seven monthly headline values required; distinct from six positive MoM price-index returns |
| Labor | Mean of last three monthly payroll changes, plus unemployment change over three monthly intervals | Thousand jobs/month and pp; weakening if payroll mean <=0 or unemployment change >=0.3pp; strengthening if payroll mean >0 and unemployment change <=0; otherwise mixed |
| Growth | Latest published real-GDP QoQ SAAR and change from prior quarter on a consistent vintage basis | Percent SAAR and pp; latest two eligible quarters; expanding if latest >0, contracting if <0, flat if =0; acceleration is a separate label |
| Policy direction | Target upper bound minus eligible level 90 calendar days earlier (last published observation at/before that date, bounded freshness) | Basis points; higher/lower/unchanged = tightening/easing/on hold; **no restrictive/neutral claim without a neutral-rate model** |
| Raw/standardized surprise | Initial actual minus verified consensus; divide by sample SD of preceding 36 same-metric initial surprises (minimum 24) | Canonical raw unit / SD units; zero dispersion is unavailable; event's own surprise is an event descriptor, never its pre-release context |

Monthly transforms must use source series values selected as of the cutoff
for **each** relevant reference period, not the current revised historical
panel. Standardization windows exclude the focal event and all later events.
Store effective lookbacks and counts, not only requested defaults.

For relative strength, restrict initial results to compatible equity proxies.
Do not subtract a weekend BTC return and a Friday-to-Monday equity return as
if they covered the same clock interval. Futures/crypto retain their own bar
completion semantics; absence of authoritative roll/basis/calendar evidence
is an explicit unavailable feature.

## 5. Independently testable milestones

### P1.1 — Pure temporal contract and selection

Exists: macro units/time helpers, release timing gate, basis declarations and
unit-test conventions. Missing: vintage-aware context observation/selection.

Affected/new files: `src/types/context.ts`,
`src/services/context/{definitions,pointInTime,quality}.ts`,
`tests/contextPointInTime.test.ts`. No database migration in this milestone.

Implement immutable in-memory input/output types, explicit knowledge modes,
revision/period selection, strict cutoff, granularity and freshness policies,
and deterministic missing reasons. Outputs carry source/observation/
publication/availability metadata and input IDs.

Tests: future publication with old reference period; later revision cannot
change a past result; same-timestamp release excluded; incomplete daily bar;
day-only vintage; missing availability; system versus reconstructed mode;
old-period revision versus new-period selection; unsorted/duplicate/conflicting
inputs; exact date/DST boundaries; missing data never zero. Run targeted Vitest,
then `npm run verify`. Document temporal-policy fixtures alongside tests.

### P1.2 — Immutable observation storage and source adapters

Exists: Prisma SQL migrations, script client factory, provider ingestion seams.
Missing: revision history, context series and continuous daily input coverage.

Affected/new files: `prisma/schema.prisma`, a new additive
`prisma/migrations/<timestamp>_add_context_observations/migration.sql`,
`scripts/ingest/{context-provider,context-fred,context-market}.ts`,
`scripts/backfill/backfill-context-observations.ts`,
`src/services/context/observationQueries.ts`, provider/ingestion tests,
`package.json`, `.env.example` only if an actually required setting is added.
Models: `ContextSeries`, `ContextObservation` only at first.

Start with VIXCLS/DGS2/DGS10; persist raw response evidence, distinguish latest
retrieval from verified vintage reconstruction, handle pagination and source
missing markers. Add completed daily equity inputs with explicit price basis.
Do not reuse the mutable candle natural key as a revision archive.

CLI is dry-run by default, with direct endpoint, explicit source/date scope,
coverage/conflict/quality summaries and a gated apply mode. Dry-run database
connections are actually read-only. Provider errors preserve a failed status;
a partial fetch cannot report a completed coverage interval.

Tests: mocked pagination/rate limits/missing values, idempotent retry,
conflicting revision quarantine, source URL redaction, precise units,
publication/observation distinction, read-only dry-run. Validate schema,
generate client, run `npm run verify` and production build. On an isolated
database, apply migrations from empty and a pre-context clone, compare catalogs
and row counts, test persistence with read-back and retries. Network-free CI
uses source fixtures; live smoke evidence is separately labeled.

### P1.3 — Volatility, rates and equity calculations

Exists: descriptive reaction analytics and numerical-test patterns. Missing:
reusable context computations and enough eligible daily inputs.

New files: `src/services/context/{volatility,rates,equity,regimes}.ts`,
`tests/context{Volatility,Rates,Equity,Regimes}.test.ts`; definition documentation.
No additional model required.

Implement only the definitions in section 4, returning typed results with
lineage and quality. Never borrow a reaction measurement to fill a context
price. Missing one family must not suppress valid independent families.

Tests: hand-calculated return/variance/yield fixtures; `ddof=1` and 252/365
annualization; zero-volatility flat series; ties/threshold equality; insufficient
history; absent trading session; mixed basis; split discontinuity; incompatible
relative-strength endpoints; same-date rate alignment; invariance of a past
feature when future rows are appended. Run targeted tests then full verify.

### P1.4 — Vintage-aware macro conditions

Exists: canonical inflation/payroll/GDP transforms and actual-source adapters.
Missing: proven legacy actual vintages, historical consensus, estimate-stage
storage and qualified macro context inputs.

New/affected files: `scripts/ingest/context-fred.ts`,
`src/services/context/{macro,surprises}.ts`,
`tests/context{Macro,Surprises}.test.ts`, existing macro registry/contract only
where needed. Reuse observation models; link qualified original releases
without overwriting `DataRelease` legacy rows.

Implement inflation/labor/growth/policy direction from eligible archival
vintages. Implement surprise eligibility and trailing normalization with
fixtures; live output stays unavailable until sourced forecasts/first prints
exist. Historical market policy expectations stay explicitly unavailable.

Tests: revised CPI/payroll/GDP values arriving after cutoff, same-metric/unit
enforcement, quarterly stage separation, six-transition persistence, missing
prior months, date-only evidence, missing/late consensus, exclusion of own
release actual, zero dispersion and insufficient surprise history. Full verify;
live sample lineage spot checks against citations before any historical
coverage claim.

### P1.5 — Reproducible snapshots and verification

Exists: event timing eligibility, additive backfill conventions and versioned
reaction reads. Missing: context materialization, input fingerprints and
coverage diagnostics.

New/affected files: second additive migration for `MarketContextSnapshot`,
`ContextFeature`, `ContextFeatureInput`;
`src/services/context/{snapshot,contextQueries}.ts`,
`scripts/backfill/backfill-market-context.ts`,
`scripts/maintenance/verify-market-context.ts`,
`tests/contextSnapshot.test.ts`, CLI scripts in `package.json`.

Materialize with explicit cutoff/knowledge mode/data freeze/versions. Refuse
untrusted event timing. Preserve older snapshots; rebuilding with new evidence
creates a distinct result. Record reason-coded unavailable features. No
required connection from context inputs to outcome measurements.

Tests: exact replay/hash stability; future/revised values cannot enter a frozen
snapshot; lineage joins cover every numerical denominator/lookback; idempotent
same-input recomputation; new config/data freeze changes identity; missing
families; invalid event timing; revision and deletion restrictions on isolated
DB. Verifier counts eligible/checked/skipped/conflicted rows and fails incomplete
strict runs. Run migrations on isolation, verify/schema/build and read-only
coverage reports; no automatic live cutover.

### P1.6 — Small event-context read integration

Exists: event detail, provenance badges, no-data panels and chart primitives.
Missing: a context panel and safe context request contract.

Affected/new files: `src/app/events/[id]/page.tsx`,
`src/components/context/MarketContextPanel.tsx`, optional
`src/app/api/context/route.ts` plus query parsing if a consumer requires it;
tests for serialization/query validation. Re-read the installed Next.js guides
for server components/route handlers before writing those files.

Show pre-release volatility/rates/trend and available macro conditions with
cutoff, observed dates, reconstruction status, rules and missing reasons.
Reuse the current UI. Do not label the old dataset as current conditions or
show fabricated upcoming releases. Full Macro Overview/navigation is Phase 4.

Validate typecheck/lint/tests/schema/build, then browser smoke for a qualified
event, untrusted timestamp, insufficient history, missing credentials/provider
coverage and mobile layout. Verify no provider request occurs on render, and
all four reaction windows and session-basis disclosures still work.

## 6. Acceptance and milestone reporting

Phase 1 is complete only when eligible historical observations can produce
deterministic, reproducible context snapshots with auditable lineage, and
unqualified inputs produce explicit unavailable values. A wired interface with
no qualified input history is plumbing completion, not data coverage completion.

Each milestone report must state: pre-existing versus missing behavior;
files/models changed; exact definitions/versions and migration status; tests
and build results; source coverage counts/ages and publication precision;
sample input/output lineage; unresolved gaps and next dependency. No significance,
alpha, forecasts or profitability claims are implied by regime classification.
