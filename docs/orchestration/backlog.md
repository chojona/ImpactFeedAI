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
| A2 | Independent audit: historical macro timing and first-print actuals; status of `feat/phase-1.1-alfred-point-in-time` (read-only) | IN PROGRESS | Codex gpt-6.2-sol, delegated by orchestrator | none (read-only) | — | — |
| A3 | Audit: NQ archive qualification and reaction measurement integration (read-only) | IN PROGRESS | Claude Opus 5.5, delegated by orchestrator | none (read-only) | — | — |
| A4 | Audit: data acquisition coverage and licensing restrictions (read-only) | DONE | Claude Opus 5.5, delegated by orchestrator | none (read-only) | — | — |
| A5 | Audit: terminal UI and end-to-end usability (read-only) | IN PROGRESS | Claude Sonnet 5.5, delegated by orchestrator | none (read-only) | — | — |
| D1 | Safe dev dependency bumps; Dependabot groups limited to minor/patch | DONE | Cursor, user thread "Assess Dependabot PR Merge Safety" | package.json, package-lock.json, .github/dependabot.yml | — | #35 |
| D2 | Dependabot production group (8 updates, incl. yahoo-finance2 3→4, framer-motion 12→14) | DONE | Dependabot; assessed by the D1 thread | package.json, package-lock.json | D1 | #32 |
| O1 | Orchestration backlog and merge policy (this file) | IN REVIEW | Orchestrator | docs/orchestration/* | — | #36 |
| L5 | Source registry licensing facts + merged-adapter status; synthetic VIX fixtures (was L7) | IN PROGRESS | Cursor Auto, delegated by orchestrator | src/services/sources/**, tests/dataSourceRegistry.test.ts, tests/fixtures/market-context/{cboe-vix.csv,fred-vixcls.json}, tests/marketContextAdapters.test.ts | A4 | — |

## Next (filled in from audit findings)

From A4 (licensing audit, 2026-11-27). Items marked **OWNER** need the
owner's decision before any worker starts.

| ID | Task | Status | Owns (files) | Depends on |
|----|------|--------|--------------|------------|
| L1 | Remove bulk Yahoo price data committed to the public repo; replace with hashes/counts. Git history rewrite is a separate **OWNER** decision | TODO (**OWNER**) | docs/audits/2026-11-05-phase-0.5/{recomputation-inputs,measurement-snapshot,recomputation-impact}.json, docs/audits/2026-11-05-phase-0.5-remediation.md | — |
| L2 | Put fetch-prices / backfill-prices / measurement-provider behind the existing candle-source permissions gate | TODO | scripts/ingest/fetch-prices.ts, scripts/backfill/backfill-prices.ts, scripts/ingest/measurement-provider.ts, tests/fetch-prices.test.ts | A3 |
| L3 | Data attribution + legal/privacy page (FRED, BLS, BEA, Fed Board, Treasury notices) | TODO | src/components/ui/DataAttribution.tsx (new), src/app/layout.tsx, src/app/legal/page.tsx (new) | A5 |
| L4 | Hide raw Yahoo OHLC/prices on the public deployment until a licensed provider exists | TODO (**OWNER**: product decision) | src/components/market/EventMarketChart.tsx, src/app/events/[id]/page.tsx, src/app/api/events/route.ts, src/services/events/* (display shaping) | A5, L3 |
| L6 | Source BLS/BEA actuals directly instead of via FRED; keep ALFRED for private vintage research | TODO | scripts/ingest/sources-bls.ts, scripts/ingest/sources-bea.ts (new), docs/data-sources.md | A2 |
| L8 | Ingest public-use-cleared nowcasts (GDPNow; Cleveland only after written terms) labelled MODEL_NOWCAST | TODO | src/services/expectations/adapters/{gdpnow,clevelandNowcast}.ts, scripts/ingest/expectations/* (new) | A2, L9 |
| L9 | Written licensing confirmations (Cleveland Fed, Philadelphia Fed, Databento/CME, FRED, Cboe); consensus-data purchase decision | BLOCKED (**OWNER**: outward contact and spending) | docs/data-sources.md (licensing section) | — |

## Done

| ID | Task | PR |
|----|------|----|
