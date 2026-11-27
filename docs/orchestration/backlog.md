# Engineering backlog

Maintained by the orchestrator thread. One row per task. A task may start
only when every task in `Depends on` is DONE, and no two IN PROGRESS tasks
may own the same file. Merge rules: [merge-policy.md](merge-policy.md).

Status values: TODO, IN PROGRESS, IN REVIEW, BLOCKED, DONE, DROPPED.
Active worker cap: 6.

## Active

| ID | Task | Status | Owner (provider/model, thread) | Owns (files) | Depends on | PR |
|----|------|--------|--------------------------------|--------------|------------|----|
| A1 | Phase 1 integration and research-readiness audit (read-only) | IN PROGRESS | Claude Opus 5.5, user thread "Phase 1 Integration Readiness Audit" | none (read-only) | — | — |
| A2 | Independent audit: historical macro timing and first-print actuals; status of `feat/phase-1.1-alfred-point-in-time` (read-only). Verdict NOT READY; phase-1.1 branch superseded by #20 | DONE | Codex gpt-6.2-sol, delegated by orchestrator | none (read-only) | — | — |
| A3 | Audit: NQ archive qualification and reaction measurement integration (read-only). Verdict NOT READY: adapter unwired; 180 verifier-failing v3 rows reach UI | DONE | Claude Opus 5.5, delegated by orchestrator | none (read-only) | — | — |
| A4 | Audit: data acquisition coverage and licensing restrictions (read-only) | DONE | Claude Opus 5.5, delegated by orchestrator | none (read-only) | — | — |
| A5 | Audit: terminal UI and end-to-end usability (read-only). Desktop usable; mobile breaks core journey | DONE | Claude Sonnet 5.5, delegated by orchestrator | none (read-only) | — | — |
| D1 | Safe dev dependency bumps; Dependabot groups limited to minor/patch | DONE | Cursor, user thread "Assess Dependabot PR Merge Safety" | package.json, package-lock.json, .github/dependabot.yml | — | #35 |
| D2 | Dependabot production group (8 updates, incl. yahoo-finance2 3→4, framer-motion 12→14) | DONE | Dependabot; assessed by the D1 thread | package.json, package-lock.json | D1 | #32 |
| O1 | Orchestration backlog and merge policy (this file) | IN REVIEW | Orchestrator | docs/orchestration/* | — | #36 |
| L5 | Source registry licensing facts + merged-adapter status; synthetic VIX fixtures (was L7) | CHANGES REQUESTED (round 1 on 0ed04b9: FRED clause attribution, Yahoo storage overstated, BEA basis); fixes routed to implementer | Cursor Auto, delegated by orchestrator | src/services/sources/**, tests/dataSourceRegistry.test.ts, tests/fixtures/market-context/{cboe-vix.csv,fred-vixcls.json}, tests/marketContextAdapters.test.ts | A4 | — |
| M1 | Calendar-period transforms (no array offsets), null-not-zero BLS parsing, PPI headline NSA basis, seed first-print values (issue #40). Also edits providers/fred.ts (owned by L5): merge after #41, then rebase | IN REVIEW (reviewer: Codex gpt-6.2-sol, head 76afe83) | Cursor Auto, delegated | src/services/macro/metrics.ts, scripts/ingest/sources-bls.ts (parsing), scripts/ingest/events-seed.ts, tests/metrics.test.ts (+ new parse/seed tests) | A2, L5 (fred.ts overlap) | #44 |
| M2 | ALFRED first-print qualification: no inferred INITIAL, common as-of cutoff for transforms, freeze before conflict detection, null-not-zero parsing | IN REVIEW (reviewer: Claude Opus 5.5, head fbe86e2) | Codex gpt-6.2-sol, delegated | src/services/context/**, src/services/macro/actualProvenance.ts, tests/context*.test.ts, tests/actualProvenance.test.ts, tests/fixtures/alfred/**, docs/historical-provenance-policy.md | A2 | #45 |
| N1 | NQ adapter hardening: exploratory needs full coverage, strict only from strict file, fail-closed artifacts, look-ahead-safe anchor helper, session-aware grid, strict parquet parsing | IN PROGRESS | Cursor Claude Opus 5.5, delegated | src/services/market/nqArchive/**, tests/nqArchive*.test.ts, tests/fixtures/nqArchive/** | A3 | — |
| N4 | NYSE calendar: add 2025-01-09 closure and verified 2027 schedule (issue #42) | MERGE-READY (APPROVE on 3f5d49a; CI green; clean, up to date) — awaiting owner go-ahead | Cursor Auto, delegated | src/services/market/sessionCalendar*.ts, tests/fixtures/nyse-hours.json, tests/sessionCalendar*.test.ts | A3 | #43 |

## Next (filled in from audit findings)

From A2 (macro), A3 (NQ), A4 (licensing) and A5 (UI) audits, 2026-11-27. Items marked **OWNER** need the
owner's decision before any worker starts.

| ID | Task | Status | Owns (files) | Depends on |
|----|------|--------|--------------|------------|
| L1 | Remove bulk Yahoo price data committed to the public repo; replace with hashes/counts. Git history rewrite is a separate **OWNER** decision | TODO (**OWNER**) | docs/audits/2026-11-05-phase-0.5/{recomputation-inputs,measurement-snapshot,recomputation-impact}.json, docs/audits/2026-11-05-phase-0.5-remediation.md | — |
| L2 | Retire or gate the legacy v2 price writers (absorbs A3/T7): permissions gate on fetch-prices / backfill-prices / measurement-provider; stop writing unread v2 asset_reactions | TODO | scripts/ingest/{fetch-prices,measurement-provider,ingest,auto-ingest,compute-reactions}.ts, scripts/backfill/backfill-prices.ts, tests/fetch-prices.test.ts | — |
| L3 | Data attribution + legal/privacy page (FRED, BLS, BEA, Fed Board, Treasury notices) | DROPPED (merged into U1) | src/components/ui/DataAttribution.tsx (new), src/app/layout.tsx, src/app/legal/page.tsx (new) | A5 |
| L4 | Hide raw Yahoo OHLC/prices on the public deployment until a licensed provider exists | TODO (**OWNER**: product decision) | src/components/market/EventMarketChart.tsx, src/app/events/[id]/page.tsx, src/app/api/events/route.ts, src/services/events/* (display shaping) | A5, L3 |
| L6 | Source BLS/BEA actuals directly instead of via FRED; keep ALFRED for private vintage research | TODO | scripts/ingest/sources-bls.ts, scripts/ingest/sources-bea.ts (new), docs/data-sources.md | A2 |
| L8 | Ingest public-use-cleared nowcasts (GDPNow; Cleveland only after written terms) labelled MODEL_NOWCAST | TODO | src/services/expectations/adapters/{gdpnow,clevelandNowcast}.ts, scripts/ingest/expectations/* (new) | A2, L9 |
| M3 | Calendar evidence identities: bundled multi-period publications, superseded/cancelled schedules, intended embargo vs earliest evidenced availability, reject nonexistent/ambiguous DST wall clocks | TODO | scripts/ingest/release-calendar/**, src/services/macro/release-calendar*.ts, src/services/macro/time.ts, tests/releaseCalendar*.test.ts | — |
| M4 | Writer integration: calendar→ingest join, statement-based Fed decisions, vintage failure leaves actual null, append-only evidence storage | BLOCKED (**OWNER**: needs schema migration) | prisma/**, scripts/ingest/{ingest,auto-ingest,fetch-macro,sources-fred,sources-fomc}.ts, scripts/maintenance/{repair-data-releases,verify-actual-provenance}.ts | M1, M2, M3 |
| M5 | Reaction eligibility + read-path quality gate (absorbs A3/T3): carry timing quality into analytics, exclude schedule-only anchors and verifier-failing rows (CL=F, GC=F, DX-Y.NYB session rows) from research outputs or badge them, invalidate measurements on superseded timing | TODO | src/services/analytics/**, src/services/events/{timing,eventQueries,mapEvent}.ts, src/components/reactions/SessionBasisBadge.tsx, scripts/maintenance/{promote-seed-timing,repair-reaction-timing}.ts | A3 |
| U1 | Mobile shell: collapsible nav, 40px touch targets, skip link; then data attribution footer + /legal page (absorbs L3) | TODO | src/components/Header.tsx, src/app/layout.tsx, src/app/globals.css, src/components/ui/DataAttribution.tsx (new), src/app/legal/page.tsx (new) | — |
| U2 | Event-desk mobile layout + chart honesty (absorbs A3/T6): horizon selector overflow, timing URL wrap, hero stat overlap, chart slot labels, stop joining independently-anchored measures / bridging gaps | TODO | src/services/events/reactionChart.ts, src/components/reactions/{HorizonSelector,EventReactionExplorer,ReactionChart}.tsx, src/components/events/{EventReactionSummary,EventHeader}.tsx, src/components/patterns/HorizonMatrix.tsx | — |
| U3 | Chart integrity: display labels not enums, robust y-range + suspect-print flag, DB-down 503 vs 404 | TODO | src/components/market/*, src/services/market/candleChart.ts, src/app/events/[id]/{page,not-found,error}.tsx | — |
| U4 | Feed: zero-result empty state bug (F1), benchmark-based "biggest move" + confounder note, pushState history, split EventBrowser | TODO | src/components/events/EventBrowser.tsx (+ new subfiles), src/app/feed/page.tsx, src/services/events/queryParams.ts | — |
| U5 | Pattern validity: group by metric and surprise sign, exploratory n<30 badge, grey cells under min n | TODO | src/app/patterns/page.tsx, src/components/patterns/* (except HorizonMatrix horizon wrapper owned by U2 while active), src/services/analytics/patternAnalysis.ts | A3, M5 |
| U6 | Calendar window/range filter with "x of y in window" | TODO | src/app/calendar/page.tsx, src/components/terminal/CalendarAgenda.tsx, src/services/events/calendarView.ts | — |
| U7 | Surprise styling: neutral when consensus unverified; one timing vocabulary; badge text ≥11px | TODO | src/components/events/{ReleaseValues,StatusBadges,EventCard}.tsx, src/services/events/releaseView.ts, src/components/terminal/LibraryCoverageMetrics.tsx, src/components/ui/{Badge,CategoryBadge}.tsx, src/components/reactions/{ReactionIndicator,MiniReactionBars}.tsx | — |
| U8 | Housekeeping: delete unreferenced src/components/landing/ (incl. PricingTable); split oversize components not owned above | TODO | src/components/landing/**, src/components/patterns/ReactionDistribution.tsx, src/components/ui/Metric.tsx | U5 |
| U9 | Neutral titles for editorial DB strings asserting consensus; audit seeded FED "consensus" values | BLOCKED (**OWNER**: production data change) | scripts/maintenance/* (new) | — |
| N2 | Wire NQ measurement provider (new provider, sessionBasis NQ symbol); registry says "not yet consumed" until then | TODO (may need **OWNER** if a schema column is required) | scripts/ingest/nq-measurement-provider.ts (new), src/services/market/sessionBasis.ts, tests/nqMeasurementProvider.test.ts (new) | N1, L5 |
| N5 | Endpoint-completion guard: refuse endpoints whose economic close is after fetchedAt; verifier enforces it | TODO | src/services/events/{reactionMeasurement,measurementVerification}.ts, scripts/backfill/backfill-reaction-measurements.ts, their tests | — |
| D3 | Dependabot #38 (@types/node 22.20.1→22.20.5, lockfile only): independent review then merge gate | TODO | package-lock.json | — |
| D4 | Dependabot #39 (eslint 9→10 major; CI green but D1 found ESLint 10 incompatible with eslint-config-next): review compatibility, close or accept | TODO | package.json, package-lock.json | D3 |
| D5 | Dependabot #37 (actions/upload-artifact 4→7, CI workflow) | TODO (**OWNER**: touches .github/) | .github/workflows/ci.yml | — |
| M6 | docs/data-acquisition-plan.md still cites PPIFIS; update after #44 merges | TODO | docs/data-acquisition-plan.md | M1 |
| D6 | Open Dependabot alerts on main: brace-expansion, minimatch (medium, dev scope) | TODO | package-lock.json | D3 |
| L9 | Written licensing confirmations (Cleveland Fed, Philadelphia Fed, Databento/CME, FRED, Cboe); consensus-data purchase decision | BLOCKED (**OWNER**: outward contact and spending) | docs/data-sources.md (licensing section) | — |

## Done

| ID | Task | PR |
|----|------|----|
