@AGENTS.md

# ImpactFeedAI — News-to-Market-Reaction Platform

## What This Is
A platform that turns major news events (tariffs, Fed decisions, CPI prints, geopolitical events)
into visual, cross-asset market reaction stories. Target user: retail trader learning to trade macro.

## Tech Stack
- Framework: Next.js 16 (App Router), React 19, TypeScript strict
- Styling: Tailwind CSS v4
- Charts: TradingView Lightweight Charts library
- Animations: Framer Motion
- Database: Neon PostgreSQL via Prisma 7 + @prisma/adapter-pg + pg
- PrismaClient requires adapter — no zero-arg constructor
- Generated client lives in src/generated/prisma (gitignored — run `npm run db:generate`)
- Active models: Event, AssetReaction, DataRelease (waitlist + email sending were removed)
- DATABASE_URL = pooled, web app only. DIRECT_URL = direct, used by Prisma CLI + all scripts
- Scripts must build clients via scripts/lib/prisma.ts (never read DATABASE_URL directly)
- Dry-runs must use scripts/lib/readonly-prisma.ts (writes throw, reads work)
- Market/macro data: yahoo-finance2 + FRED/BLS REST, ingestion scripts only
- Tests: Vitest, `npm test`, unit only, in tests/. `npm run verify` = typecheck+lint+test
- Node 22.12+ (engines). yahoo-finance2 v3 does not support Node 20.
- State: React useState/useContext (no Redux yet)
- AI: planned, not built. @anthropic-ai/sdk is installed but unused.
- Price Data: Polygon.io is the intended provider but is NOT integrated yet.

## Project Structure
- src/app/ — Next.js routes, layouts, and route handlers (/api/*)
- src/components/ — Reusable UI, grouped by domain (events/, charts/, landing/, patterns/, ui/)
- src/lib/ — Third-party clients + app config (prisma.ts, eventCategories.ts, assets.ts)
- src/services/ — Business logic and external-API services:
  - analytics/ — aggregate reaction stats
  - events/ — Prisma queries, query-param parsing, DB row → UI mapping
  - macro/ — canonical metric registry + DST-aware US-Eastern timestamps
- src/types/ — Shared TypeScript types (events.ts)
- scripts/lib/ — Prisma factories for scripts (prisma.ts, readonly-prisma.ts)
- scripts/ingest/ — Macro + price ingestion pipelines (has its own README)
- scripts/backfill/ — Price backfill for events ingested with --no-prices
- scripts/maintenance/ — DB verification, smoke tests, data repair
- tests/ — Vitest unit tests
- prisma/schema.prisma — Database schema
- docs/ — vision, architecture, data-sources, research-methodology, roadmap

Read docs/architecture.md before adding a new file — it documents what is built
vs. planned and where each kind of code belongs.

The UI reads the database. /feed, /events/[id], /patterns and /api/events all
query Postgres via src/services/events/. There are no mock fixtures — do not
reintroduce any. An empty database must render an empty state, never invented
sample data.

## Coding Rules
- Always use TypeScript with strict types — no `any`
- Functional components only, no class components
- Use async/await, never raw .then() chains
- Keep components under 150 lines — extract if longer
- Use named exports, not default exports for components
- Tailwind for all styling — no inline styles except dynamic values
- Mobile-first responsive design always
- EventCategory has a higherIsBetter flag for surprise coloring:
  INFLATION = false (hot print = red)
  FED = false (higher rate = red) 
  EARNINGS = true (beat = green)
  JOBS/NFP = true (more jobs = green)
  TARIFF = false (bigger tariff = red)
  - Always use category.higherIsBetter to determine surprise direction, 
    never raw actualValue > expectedValue comparison

## Current Phase
MVP — Phase 1 is wired end to end. Do NOT add AI features yet.
The highest-value remaining work is a consensus/forecast source:
FRED and BLS publish actuals only, so most events have no expectedValue
and therefore no surprise, which is what the whole research thesis rests on.

## Data integrity rules (non-negotiable)
- A value that cannot be measured is null, NEVER 0. A fabricated 0.00% price
  move is indistinguishable from a measured flat market and poisons every
  average computed over it.
- Within one DataRelease row, expectedValue / actualValue / priorValue /
  surpriseMagnitude are all in that metric's canonical unit (see
  src/services/macro/metrics.ts). Never mix a raw index level with a headline
  percentage.
- Percentage surprises are quoted in percentage POINTS (pp), not percent.
- A missing prior is unknown, not "unchanged" — omit the comparison.
- Never write a metricName that metricByCanonicalName() cannot resolve; the app
  needs it to recover the unit.
- Never invent prose, numbers or dates to fill a null column.

## Design Direction
Dark theme. Professional fintech aesthetic. Fast, clean, data-dense.
Think Bloomberg terminal meets a modern consumer app.
Color palette: dark backgrounds (#080C10), green accent (#00FF94), 
orange secondary (#FF6B35).

## Do NOT
- Add authentication yet
- Add payments yet  
- Use any external CSS libraries other than Tailwind
- Install new dependencies without flagging it first