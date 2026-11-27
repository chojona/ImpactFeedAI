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
| A3 | Audit: NQ archive qualification and reaction measurement integration (read-only) | IN PROGRESS | Claude Opus 5.5, delegated by orchestrator | none (read-only) | — | — |
| A4 | Audit: data acquisition coverage and licensing restrictions (read-only) | DONE | Claude Opus 5.5, delegated by orchestrator | none (read-only) | — | — |
| A5 | Audit: terminal UI and end-to-end usability (read-only). Desktop usable; mobile breaks core journey | DONE | Claude Sonnet 5.5, delegated by orchestrator | none (read-only) | — | — |
| D1 | Safe dev dependency bumps; Dependabot groups limited to minor/patch | DONE | Cursor, user thread "Assess Dependabot PR Merge Safety" | package.json, package-lock.json, .github/dependabot.yml | — | #35 |
| D2 | Dependabot production group (8 updates, incl. yahoo-finance2 3→4, framer-motion 12→14) | DONE | Dependabot; assessed by the D1 thread | package.json, package-lock.json | D1 | #32 |
| O1 | Orchestration backlog and merge policy (this file) | IN REVIEW | Orchestrator | docs/orchestration/* | — | #36 |
| L5 | Source registry licensing facts + merged-adapter status; synthetic VIX fixtures (was L7) | IN PROGRESS | Cursor Auto, delegated by orchestrator | src/services/sources/**, tests/dataSourceRegistry.test.ts, tests/fixtures/market-context/{cboe-vix.csv,fred-vixcls.json}, tests/marketContextAdapters.test.ts | A4 | — |
| M1 | Calendar-period transforms (no array offsets), null-not-zero BLS parsing, PPI headline NSA basis, seed first-print values | IN PROGRESS | Cursor Auto, delegated | src/services/macro/metrics.ts, scripts/ingest/sources-bls.ts (parsing), scripts/ingest/events-seed.ts, tests/metrics.test.ts (+ new parse/seed tests) | A2 | — |
| M2 | ALFRED first-print qualification: no inferred INITIAL, common as-of cutoff for transforms, freeze before conflict detection, null-not-zero parsing | IN PROGRESS | Codex gpt-6.2-sol, delegated | src/services/context/**, src/services/macro/actualProvenance.ts, tests/context*.test.ts, tests/actualProvenance.test.ts, tests/fixtures/alfred/**, docs/historical-provenance-policy.md | A2 | — |

## Next (filled in from audit findings)

From A2 (macro), A4 (licensing) and A5 (UI) audits, 2026-11-27. Items marked **OWNER** need the
owner's decision before any worker starts.

| ID | Task | Status | Owns (files) | Depends on |
|----|------|--------|--------------|------------|
| L1 | Remove bulk Yahoo price data committed to the public repo; replace with hashes/counts. Git history rewrite is a separate **OWNER** decision | TODO (**OWNER**) | docs/audits/2026-11-05-phase-0.5/{recomputation-inputs,measurement-snapshot,recomputation-impact}.json, docs/audits/2026-11-05-phase-0.5-remediation.md | — |
| L2 | Put fetch-prices / backfill-prices / measurement-provider behind the existing candle-source permissions gate | TODO | scripts/ingest/fetch-prices.ts, scripts/backfill/backfill-prices.ts, scripts/ingest/measurement-provider.ts, tests/fetch-prices.test.ts | A3 |
| L3 | Data attribution + legal/privacy page (FRED, BLS, BEA, Fed Board, Treasury notices) | DROPPED (merged into U1) | src/components/ui/DataAttribution.tsx (new), src/app/layout.tsx, src/app/legal/page.tsx (new) | A5 |
| L4 | Hide raw Yahoo OHLC/prices on the public deployment until a licensed provider exists | TODO (**OWNER**: product decision) | src/components/market/EventMarketChart.tsx, src/app/events/[id]/page.tsx, src/app/api/events/route.ts, src/services/events/* (display shaping) | A5, L3 |
| L6 | Source BLS/BEA actuals directly instead of via FRED; keep ALFRED for private vintage research | TODO | scripts/ingest/sources-bls.ts, scripts/ingest/sources-bea.ts (new), docs/data-sources.md | A2 |
| L8 | Ingest public-use-cleared nowcasts (GDPNow; Cleveland only after written terms) labelled MODEL_NOWCAST | TODO | src/services/expectations/adapters/{gdpnow,clevelandNowcast}.ts, scripts/ingest/expectations/* (new) | A2, L9 |
| M3 | Calendar evidence identities: bundled multi-period publications, superseded/cancelled schedules, intended embargo vs earliest evidenced availability, reject nonexistent/ambiguous DST wall clocks | TODO | scripts/ingest/release-calendar/**, src/services/macro/release-calendar*.ts, src/services/macro/time.ts, tests/releaseCalendar*.test.ts | — |
| M4 | Writer integration: calendar→ingest join, statement-based Fed decisions, vintage failure leaves actual null, append-only evidence storage | BLOCKED (**OWNER**: needs schema migration) | prisma/**, scripts/ingest/{ingest,auto-ingest,fetch-macro,sources-fred,sources-fomc}.ts, scripts/maintenance/{repair-data-releases,verify-actual-provenance}.ts | M1, M2, M3 |
| M5 | Reaction eligibility: carry timing quality into analytics, exclude schedule-only anchors from research outputs, invalidate measurements on superseded timing | TODO | src/services/analytics/**, src/services/events/{timing,eventQueries,mapEvent}.ts, scripts/maintenance/{promote-seed-timing,repair-reaction-timing}.ts | A3 |
| U1 | Mobile shell: collapsible nav, 40px touch targets, skip link; then data attribution footer + /legal page (absorbs L3) | TODO | src/components/Header.tsx, src/app/layout.tsx, src/app/globals.css, src/components/ui/DataAttribution.tsx (new), src/app/legal/page.tsx (new) | — |
| U2 | Event-desk mobile layout: horizon selector overflow, timing URL wrap, hero stat overlap, chart slot labels | TODO | src/components/reactions/{HorizonSelector,EventReactionExplorer,ReactionChart}.tsx, src/components/events/{EventReactionSummary,EventHeader}.tsx, src/components/patterns/HorizonMatrix.tsx | — |
| U3 | Chart integrity: display labels not enums, robust y-range + suspect-print flag, DB-down 503 vs 404 | TODO | src/components/market/*, src/services/market/candleChart.ts, src/app/events/[id]/{page,not-found,error}.tsx | — |
| U4 | Feed: zero-result empty state bug (F1), benchmark-based "biggest move" + confounder note, pushState history, split EventBrowser | TODO | src/components/events/EventBrowser.tsx (+ new subfiles), src/app/feed/page.tsx, src/services/events/queryParams.ts | — |
| U5 | Pattern validity: group by metric and surprise sign, exploratory n<30 badge, grey cells under min n | TODO | src/app/patterns/page.tsx, src/components/patterns/* (except HorizonMatrix horizon wrapper owned by U2 while active), src/services/analytics/patternAnalysis.ts | A3, M5 |
| U6 | Calendar window/range filter with "x of y in window" | TODO | src/app/calendar/page.tsx, src/components/terminal/CalendarAgenda.tsx, src/services/events/calendarView.ts | — |
| U7 | Surprise styling: neutral when consensus unverified; one timing vocabulary; badge text ≥11px | TODO | src/components/events/{ReleaseValues,StatusBadges,EventCard}.tsx, src/services/events/releaseView.ts, src/components/terminal/LibraryCoverageMetrics.tsx, src/components/ui/{Badge,CategoryBadge}.tsx, src/components/reactions/{ReactionIndicator,MiniReactionBars}.tsx | — |
| U8 | Housekeeping: delete unreferenced src/components/landing/ (incl. PricingTable); split oversize components not owned above | TODO | src/components/landing/**, src/components/patterns/ReactionDistribution.tsx, src/components/ui/Metric.tsx | U5 |
| U9 | Neutral titles for editorial DB strings asserting consensus; audit seeded FED "consensus" values | BLOCKED (**OWNER**: production data change) | scripts/maintenance/* (new) | — |
| L9 | Written licensing confirmations (Cleveland Fed, Philadelphia Fed, Databento/CME, FRED, Cboe); consensus-data purchase decision | BLOCKED (**OWNER**: outward contact and spending) | docs/data-sources.md (licensing section) | — |

## Done

| ID | Task | PR |
|----|------|----|
