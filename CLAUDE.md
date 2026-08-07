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
- Database: PostgreSQL via Prisma 7 + @prisma/adapter-pg + pg
- PrismaClient requires adapter — no zero-arg constructor
- Generated client lives in src/generated/prisma (gitignored — run `npm run db:generate`)
- Email: Resend (waitlist notifications)
- Market/macro data: yahoo-finance2 + FRED/BLS REST, ingestion scripts only
- State: React useState/useContext (no Redux yet)
- AI: planned, not built. @anthropic-ai/sdk is installed but unused.
- Price Data: Polygon.io is the intended provider but is NOT integrated yet.

## Project Structure
- src/app/ — Next.js routes, layouts, and route handlers (/api/*)
- src/components/ — Reusable UI, grouped by domain (events/, charts/, landing/, patterns/, ui/)
- src/lib/ — Third-party clients + app config (prisma.ts, resend.ts, eventCategories.ts)
- src/lib/mock-data/ — PLACEHOLDER fixtures the UI renders today; delete once the DB is wired up
- src/services/ — Business logic and external-API services (analytics/)
- src/types/ — Shared TypeScript types (events.ts)
- scripts/ingest/ — Macro + price ingestion pipelines (has its own README)
- scripts/maintenance/ — DB verification and upkeep scripts
- prisma/schema.prisma — Database schema
- docs/ — vision, architecture, data-sources, research-methodology, roadmap

Read docs/architecture.md before adding a new file — it documents what is built
vs. planned and where each kind of code belongs.

Important: the UI does NOT read the database yet. Pages and /api/events render
from src/lib/mock-data/; the ingestion scripts write to Postgres. Connecting
them is the current priority.

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
MVP — Phase 1. Building the curated event library.
Do NOT add AI features yet. Focus on core event card display,
chart rendering, and the expectation vs reality component.

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