# V2 roadmap

Updated November 5, 2026 from the [repository audit](audits/2026-11-05-repository-audit.md).
This supersedes the prior phase numbering: old Phase 2 market context is now
**V2 Phase 1**. Statistical research precedes similarity, the expanded dashboard
and AI. Existing event/candle/reaction systems are preserved.

Status labels: **built** means inspected implementation; **partial** means
coverage/wiring is incomplete; **planned** means no implementation claim.
Counts below are a November 5 snapshot, not product constants.

## Phase 0 — audit and integrity gates

### Delivered

- [x] Architecture, schema, migrations, writers/readers, tests, documentation
  and recent reaction-engine commit history inspected.
- [x] Typecheck/lint/518 tests, schema validation and network-enabled production
  build pass; candle checks 10/10; reaction verifier checks 828 current rows.
- [x] Read-only live coverage and catalog evidence: 50 events, 21 release rows,
  597 archive rows, 828 live measurements, 1,276 candles; four applied migrations
  match local checksums; read-only Prisma schema diff reports no difference.
- [x] Detailed audit, corrected architecture proposal and concrete Phase 1 plan
  saved; no production mutations or migrations applied.

### R0 — repair calendar and verification integrity (highest priority)

- [ ] Correct the three false equity early closes against official NYSE sources.
- [ ] Add regular-session **negative** fixtures for 2022-07-01, 2022-12-23 and
  2026-07-02, retaining real half-day fixtures; reproduce and prevent the
  post-release daily-close anchor defect.
- [ ] Independently validate release-session origin and pre-release economic
  close, with explicit stock/futures/crypto semantics.
- [ ] Make verifier completeness measurable: checked/total/skipped/invalid;
  strict incomplete runs fail, including reference-provider failure, missing
  release time and zero verification coverage. Validate timing source/status.
- [ ] Follow the existing reaction contract §6.3 calculation-version bump rule;
  validate an additive recomputation on isolation, retain v3/v2 evidence and
  obtain complete verification before changing the current read version.
- [ ] Update operational coverage checks to measure current reactions, not only
  the v2 archive. No production repair or read cutover has been performed.

Acceptance: source-backed calendar regressions pass; corrupted/skipped cases
cannot pass strict verification; all four measures and session-basis disclosure
remain intact. Any version cutover has reviewed coverage/lineage evidence and
an additive rollback path.

The audit found no current release/anchor-session exposure to the three
disputed dates. Still compare coverage before a version cutover: provider
retention/revisions may prevent an exact re-fetch of old intraday inputs.
Archive source evidence and report losses explicitly; a version bump alone
does not prove that every prior measurement can be reproduced today.

### R1 — establish trustworthy input and writer boundaries

- [ ] Define an observation eligibility contract before treating legacy actuals
  or current FRED/BLS history as historical context. Persist vintage/fallback
  status; no silent latest-vintage promotion.
- [ ] Define a v3/current-version ingestion/catch-up workflow; legacy writers
  must not report successful live reaction coverage for archive-only writes.
- [ ] Make audit/dry-run database access read-only at the connection level.
- [ ] Keep all 21 legacy actuals/20 unverified forecasts visibly unqualified;
  do not invent metric keys, reference periods, sources or first prints.

Acceptance: new eligible event fixtures reach the live measurement workflow;
archive mutation is not part of normal ingestion; point-in-time eligibility
is explicit. Metadata boundaries can be completed before bulk enrichment;
**full historical consensus coverage is not required to build independent
volatility/rates features**, but surprise features remain unavailable without it.

## Phase 1 — quantitative market context

**Planned; implementation gated by R0/R1.** Detailed scope, files/models,
formulas, units, timing rules, six testable milestones and acceptance criteria:
[Phase 1 implementation plan](phase-1-market-context-plan.md).

1. P1.1: pure point-in-time/revision selector and quality contract.
2. P1.2: immutable context observation schema; qualified VIX/yield/daily-price
   adapters; bounded dry-run-default archival pipeline.
3. P1.3: volatility/rates/equity continuous features and deterministic regimes.
4. P1.4: vintage-aware inflation/labor/growth/policy direction; qualified surprise
   calculations; unavailable expectations/consensus explicitly reported.
5. P1.5: immutable snapshots, lineage, input hashes, strict coverage verifier.
6. P1.6: small context panel on existing event detail, with provenance/missingness.

Acceptance: past snapshots remain unchanged when future observations/revisions
arrive; every calculated value traces to eligible observations; unknown inputs
produce missing reasons; no post-release outcome is a pre-release input. No
ML or predictive claims. A partial data family does not masquerade as complete
Phase 1 coverage.

## Phase 2 — statistical research engine

**Partial descriptive foundation; remaining work planned.** Reuse per-measure
means/medians/ranges/frequencies/distributions in `patternAnalysis.ts`, keeping
instrument, canonical metric, reaction measure and context definition explicit.

- [ ] Reusable SD/quantile/distribution operations with documented conventions.
- [ ] Deterministic seeded bootstrap confidence intervals and baseline-relative
  effect sizes, with matched unconditional sample definitions.
- [ ] Distinct-event counts, missingness, overlap/dependence, quality and regime
  sensitivity diagnostics; 828 cross-asset rows are not 828 independent events.
- [ ] Hypothesis counts, multiple-testing awareness, temporal walk-forward and
  held-out evaluation; preprocessing/threshold fitting uses training data only.
- [ ] Immutable research specifications, dataset versions, sample IDs, parameters,
  seeds, tool outputs and exportable results.

Acceptance: a reproducible conditional distribution with baseline, uncertainty,
selection/quality diagnostics and descriptive-versus-OOS status; no unsupported
alpha label. Verified initial actual/consensus coverage gates surprise studies.

## Phase 3 — historical similarity

**Planned.** Begin with explicit feature normalization, interpretable distances,
weights and explanations. Fit normalization/feature choices only on prior or
training history; missing dimensions and coverage are visible.

- [ ] Compare against same-event-type and simple nearest-date/regime baselines.
- [ ] Keep candidate information strictly earlier than the query cutoff;
  candidate features use each event's own pre-release information set.
- [ ] Evaluate subsequent returns separately, with leakage/overlap and OOS checks.
- [ ] Report feature contributions, distances, mismatches, ages and sample sizes.

Embeddings/ML require evidence of improvement over the simple baselines first.

## Phase 4 — quantitative dashboard

**Existing Event Explorer foundation; expanded views planned.**

- [ ] Macro Overview: current qualified conditions and freshness; upcoming
  releases only from a sourced schedule, not reference-period extrapolation.
- [ ] Macro Event Explorer: extend current feed/detail with metric-specific
  filtering, qualified surprises, context and provenance.
- [ ] Quantitative Research Lab: conditional filters, distributions, baselines,
  uncertainty, historical comparison and exports.
- [ ] Historical Analog Explorer: interpretable matches and observed outcomes.
- [ ] AI Research Workspace shell only when approved research operations exist.

Reuse shared design tokens, navigation, chart primitives and responsive layout;
prioritize data density and explanatory charts. No decorative placeholder data.

## Phase 5 — grounded AI macro research analyst

**Planned; SDK dependency alone is not infrastructure completion.**

- [ ] Natural language → validated research spec/query operations, not arbitrary
  executable model SQL.
- [ ] Deterministic tool calculations with saved inputs/versions/seeds.
- [ ] Answers cite datasets, release rows and reproducible research results.
- [ ] State sample selection, uncertainty, missingness and correlation limits.
- [ ] Unsupported requests or insufficient data produce explicit limitations.

Acceptance: the same approved specification reproduces every numerical claim
without the language model; descriptive relationships never become forecasts
through prose alone.

## Scope discipline

Preserve Next.js, TypeScript, Prisma, npm and existing PostgreSQL conventions.
No FastAPI rewrite, model-driven regimes, new provider purchases, destructive
production repair, trading signals, execution, unsupported price forecasts or
profitability claims. Authentication/payments/advanced order-flow work are not
prerequisites for this research foundation. Every milestone documents affected
files/models, provenance/assumptions, validation, completion and limitations.
