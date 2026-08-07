# Architecture

This document describes the repository as it actually is, and marks clearly
where something is planned rather than built.

**Status legend**

| Tag | Meaning |
| --- | --- |
| ✅ **Built** | Exists in the repository and runs |
| 🟡 **Partial** | Exists but incomplete or not wired into the product |
| 📋 **Planned** | Agreed direction, no code yet |
| 💭 **Conceptual** | Idea under consideration, may change |

---

## System overview

Today the system is a single Next.js application plus a set of standalone
ingestion scripts that share one Postgres database and one Prisma schema. There
is no separate backend service.

```
┌──────────────────────────────┐        ┌───────────────────────────┐
│  Next.js app (src/)          │        │  Scripts (scripts/)       │
│                              │        │                           │
│  RSC pages ──┐               │        │  ingest.ts (curated)      │
│              ├── Route       │        │  auto-ingest.ts (bulk)    │
│  Client      │   Handlers    │        │  verify-db.ts             │
│  components ─┘   (/api/*)    │        │                           │
└──────┬───────────────────────┘        └────────────┬──────────────┘
       │                                             │
       │ ✅ reads                                    │ ✅ writes
       ▼                                             ▼
┌──────────────┐  ┌───────────────────────────────────────────────┐
│ mock-data/   │  │  PostgreSQL (Prisma)                          │
│ (fixtures)   │  │  events | asset_reactions | data_releases     │
└──────────────┘  └───────────────────────────────────────────────┘
```

**The most important thing to understand about this codebase:** the UI and the
database are not connected. Pages and `/api/events` render from
`src/lib/mock-data/`; the ingestion scripts write to Postgres; nothing reads
the ingested rows back out except `scripts/maintenance/verify-db.ts`. Closing
that gap is Phase 1 of the roadmap.

Since the waitlist was removed, **no part of the running web app touches
Postgres at all** — `src/lib/prisma.ts` currently has no callers. It is kept
because Phase 1 wires `/api/events` to the database.

---

## Frontend

✅ **Built** — Next.js 16.2.6, App Router, React 19.2, TypeScript 5 in `strict`
mode.

### Rendering model

Server Components are the default. Client Components are opt-in islands marked
with `"use client"`, used only where interactivity or a browser API is needed:

| Client component | Why |
| --- | --- |
| `components/events/EventBrowser.tsx` | URL-synced filter/search/sort state, `fetch` to `/api/events` |
| `components/events/EventCard.tsx` | expand/collapse animation |
| `components/events/CategoryFilterBar.tsx`, `SearchBar.tsx` | input handling |
| `components/charts/AssetChart.tsx` | `lightweight-charts` needs a DOM node |
| `components/charts/ChartReplayPanel.tsx` | replay playback state |
| `components/ui/BackButton.tsx` | `router.back()` |

Everything else — the landing page, event detail, patterns page — is a Server
Component. There are **no Server Actions**; mutations go through Route
Handlers.

### Routes

| Route | Type | What it does | Data source |
| --- | --- | --- | --- |
| `/` | RSC | Landing: hero, feature grid, pricing table | static |
| `/feed` | RSC + client island | Event browser with category filter, search, sort, pagination | `/api/events` |
| `/events/[id]` | RSC, `generateStaticParams` | Event detail, expectation vs. actual, chart replay, per-asset commentary | `mock-data/` |
| `/patterns` | RSC | Per-category aggregate reaction stats | `mock-data/` + `services/analytics` |
| `/api/events` | Route Handler (GET) | Filter / search / sort / paginate the event list | `mock-data/` 🟡 |

`generateStaticParams` on `/events/[id]` enumerates the placeholder events. Once
events come from the database this needs to become a dynamic or ISR route.

### Styling

Tailwind CSS v4 via `@tailwindcss/postcss`, imported in `src/app/globals.css`.
No component library, no other CSS framework — per the project's coding rules.

Fonts are IBM Plex Sans / Mono, loaded with `next/font/google` in the root
layout and exposed as `--font-ibm-sans` / `--font-ibm-mono`.

The palette (dark `#080C10` background, `#00FF94` green, `#FF6B35` orange) is
applied as hardcoded Tailwind arbitrary values across components. `globals.css`
still carries the create-next-app light/dark `prefers-color-scheme` variables,
which nothing meaningfully uses because every page hardcodes the dark surface.
🟡 Worth consolidating into theme tokens.

### Shared UI types

`src/types/events.ts` holds the presentation-layer domain types (`NewsEvent`,
`AssetReaction`, `EventCategory`, `Direction`, `ChartDataPoint`).
`src/lib/eventCategories.ts` holds `CATEGORY_CONFIG` — per-category colour and
the `higherIsBetter` flag that decides whether a surprise renders green or red.

⚠️ **Two vocabularies exist.** The UI type `EventCategory` (`FED`,
`INFLATION`, `EARNINGS`, …) and the Prisma enum `EventType` (`FED_DECISION`,
`CPI`, `PPI`, `NFP`, `EARNINGS_SURPRISE`, …) describe the same concept with
different values, and the interface `AssetReaction` in `types/events.ts` shares
a name with the Prisma model `AssetReaction` while having a different shape. A
mapping layer between database rows and UI types is the first thing Phase 1
needs; the alternative is to converge on the Prisma vocabulary and delete the
duplicate.

---

## Backend

✅ **Built** — Next.js Route Handlers only. No tRPC, no GraphQL, no separate API
server, no Server Actions.

`GET /api/events` is the only route handler that remains. The waitlist
endpoint that previously wrote signups to Postgres has been removed along with
the rest of the waitlist feature, so the app performs no database writes and
sends no email.

### `GET /api/events`

🟡 Serves `src/lib/mock-data/events.ts` with in-memory filtering, search,
sorting and pagination, plus per-category counts. The query-parameter contract
(`type`, `q`, `sort`, `offset`, `limit`) and the response envelope
(`{ events, total, offset, limit, counts }`) are worth keeping — swapping the
data source for Prisma queries should not require touching `EventBrowser`.

### Where server logic should live

- **Route Handlers** (`src/app/api/*`) stay thin: parse and validate input, call
  a service, shape the response.
- **`src/services/*`** holds business logic and external-API access. Currently
  only `services/analytics/patternAnalysis.ts`.
- **`src/lib/*`** holds clients and configuration: `prisma.ts` and
  `eventCategories.ts`.
- **`src/server/`** 📋 does not exist yet. Add it when there is server-only
  logic that is neither a client wrapper nor a domain service — query builders,
  caching, auth. Do not create it empty.

---

## Database

✅ **Built** — PostgreSQL, accessed through Prisma 7.8.

### Prisma setup

Prisma 7 requires a driver adapter: `PrismaClient` has **no zero-argument
constructor**. `src/lib/prisma.ts` builds it with `new PrismaPg({ connectionString })`
and caches the instance on `globalThis` outside production to survive dev
hot-reloads.

The client is generated with the `prisma-client` generator into
`src/generated/prisma/`, which is **gitignored** — run `npm run db:generate`
after cloning or the build fails. `prisma.config.ts` declares the schema path,
the migrations path, and resolves the CLI connection URL through
`dotenv/config` as `DIRECT_URL ?? DATABASE_URL`.

### Hosting and endpoints

The database is hosted on **Neon** (PostgreSQL 18.x). Neon exposes two
endpoints for the same database, and the distinction matters:

| Endpoint | Hostname | Used by |
| --- | --- | --- |
| **Pooled** | contains `-pooler.` | the app on Vercel — serverless opens many short-lived connections |
| **Direct** | without `-pooler.` | Prisma migrations, and everything running locally |

Migrations must never run through the pooled endpoint: Prisma takes advisory
locks, which are unreliable under PgBouncer transaction-mode pooling. That is
why `prisma.config.ts` prefers `DIRECT_URL`.

Routing is by consumer rather than by environment, so both variables are set
the same way locally and in production:

| Consumer | Variable | Endpoint |
| --- | --- | --- |
| `src/lib/prisma.ts` (web app) | `DATABASE_URL` | pooled |
| `prisma.config.ts` (CLI/migrations) | `DIRECT_URL ?? DATABASE_URL` | direct |
| `scripts/lib/prisma.ts` (ingestion + maintenance) | `DIRECT_URL ?? DATABASE_URL` | direct |

`scripts/lib/prisma.ts` is a small shared factory so the endpoint choice lives
in exactly one place — if it drifted per-script, some jobs would silently run
through the pooler.

### Models

| Model | Table | Purpose |
| --- | --- | --- |
| `Event` | `events` | `headline`, `eventType` (enum), `occurredAt`, `sourceUrl`, `explanation`; unique on `(headline, occurredAt)`; indexed on `occurredAt` and `eventType` |
| `AssetReaction` | `asset_reactions` | FK → `Event`, `assetSymbol`, `priceAtEvent`, `price1h/1d/1w`, `pctChange1h/1d/1w`; unique on `(eventId, assetSymbol)` |
| `DataRelease` | `data_releases` | FK → `Event`, `metricName`, `expectedValue`, `actualValue`, `priorValue`, `surpriseMagnitude`; unique on `(eventId, metricName)` |

`EventType` enum: `TARIFF`, `FED_DECISION`, `CPI`, `PPI`, `NFP`,
`GEOPOLITICAL`, `EARNINGS_SURPRISE`, `MACRO_DATA`.

One migration exists: `20260512194452_init`, a clean baseline that creates the
`EventType` enum and the three tables above with their indexes and foreign
keys. It matches `schema.prisma` exactly — there is no pending drift.

The original waitlist-only migration was deleted when the database moved from
Railway to Neon. Because the Neon database was provisioned fresh and no
environment depended on the old journal, rebuilding the baseline was preferable
to shipping a create-then-drop pair for a table the product no longer has.

### Assessment against the product goals

The schema is a sound MVP foundation. The natural keys and unique constraints
are what make the ingestion pipeline safely idempotent, and the
`Event → AssetReaction / DataRelease` split is the right decomposition.

Gaps to address as the product grows — **conceptual, no migration written**:

- **Reaction windows are columns, not rows.** `price1h/1d/1w` cannot express
  5-minute, 30-minute, 4-hour or 3-day windows without a schema change every
  time. A long `EventReaction(eventId, instrumentId, window, …)` table scales;
  the current wide table does not.
- **No instrument table.** `assetSymbol` is a bare string, so there is nowhere
  to record asset class, exchange, contract details, or symbol changes.
- **No market context.** Nothing stores VIX, yields, trend or regime at the
  time of an event — the context that makes an analog meaningful.
- **No data provenance.** A row cannot say which provider it came from, when it
  was fetched, or whether the value has since been revised. Macro data *is*
  revised; without provenance the platform will silently mix vintages.
- **`Event.explanation` is a free-text column with no writer.** It is where AI
  commentary is meant to land; nothing populates it today.

💭 A plausible future entity set: `Instrument`, `EconomicEvent`,
`EventReaction`, `MarketSnapshot`, `MarketRegime`, `DataSource`,
`HistoricalAnalog`. See [roadmap.md](roadmap.md) for sequencing. Deliberately
**not** implemented yet: designing these before the first end-to-end read path
exists would be guessing.

---

## Data pipeline

✅ **Built** — two independent pipelines under `scripts/ingest/`, run manually
with `tsx`. There is no scheduler, queue, or live feed.

### Conceptual flow

```
External APIs   ✅ FRED, BLS, Yahoo Finance
      ↓
Ingestion       ✅ scripts/ingest/{ingest,auto-ingest}.ts
      ↓
Normalization   🟡 per-series transforms (YoY %, MoM Δ, level %, QoQ ann.)
      ↓                and % change / surprise math
Database        ✅ events / asset_reactions / data_releases
      ↓
Analytics       🟡 services/analytics/patternAnalysis.ts (runs on fixtures, not DB)
      ↓
Similarity      📋 not started
      ↓
AI retrieval    📋 not started
      ↓
Frontend        🟡 renders fixtures, not database rows
```

### `ingest.ts` — curated seed

Walks ~51 hand-written events in `events-seed.ts`. For each: skip if
`(headline, occurredAt)` already exists; fetch a Yahoo price window for all 12
symbols in `ASSET_UNIVERSE`; resolve anchor / +1h / +1d / +1w prices; fetch
FRED actual and prior for CPI / PPI / NFP / FED_DECISION; write everything in
one transaction. Rate-limited at 500 ms per symbol, 1 s per event.

### `auto-ingest.ts` — bulk backfill

Async generators yield candidate events from three sources — 11 FRED series, 4
BLS series, and FOMC rate decisions derived by walking the `DFEDTARU` daily
series for step changes. Deduplicates against existing events of the same type
within ±1 day. `--no-prices` loads metadata in ~15 minutes; a full run with
Yahoo prices takes 4–5 hours.

### Failure model

Both pipelines are deliberately best-effort: a failed symbol yields nulls and a
warning, a FRED error skips the macro row, a transaction failure skips the
event. Only unrecoverable conditions (missing `DATABASE_URL`, unparseable
timestamps) halt the run. Re-runs are idempotent.

### Known pipeline limitations

- **Consensus estimates are hand-entered.** FRED and BLS publish actuals only.
  Without a forecast source, `surpriseMagnitude` exists only for events where
  someone typed the consensus into `events-seed.ts`. This is the single biggest
  data constraint on the whole product — see
  [data-sources.md](data-sources.md).
- **FRED observation dates are reference dates, not release dates.** The
  pipeline takes the last observation on or before the event date. For a
  release-time analysis, release dates (FRED's ALFRED vintages) are the correct
  key.
- **No hold meetings.** FOMC events come from rate *changes*, so meetings that
  held rates steady produce no event.
- **Yahoo intraday history is ~730 days.** Events older than that get daily
  granularity only; `price1h` is null.
- **No price backfill path.** A `--no-prices` run followed by a normal run does
  not add prices to already-inserted events — dedup skips them. A dedicated
  backfill script is needed.

### Where ingestion code should eventually live

📋 The HTTP clients in `scripts/ingest/` (FRED, BLS, Yahoo) are services the web
app will also want. The intended end state is `src/services/macro/` and
`src/services/market-data/` for the fetchers, with `scripts/` keeping only the
CLI orchestration. That move is deferred until something in the app actually
needs them — moving working code with no consumer is churn.

### Script organisation

```
scripts/
├── ingest/        ✅ pipelines + sources + shared fetch/compute helpers
└── maintenance/   ✅ verify-db.ts (row counts, per-type breakdown, coverage)
```

📋 `scripts/backfill/` and `scripts/analysis/` when there is something to put in
them.

---

## AI layer

📋 **Not built.** `@anthropic-ai/sdk` is installed but imported nowhere; there
are no API calls to any model, and `ANTHROPIC_API_KEY` is not read anywhere in
the codebase.

The design constraint is settled even though the code is not:

> **The LLM is never the source of truth for historical market data.** The
> structured database is. The AI layer retrieves rows, summarises them,
> compares them, and explains them.

Concretely, that means:

1. A natural-language question is translated into a **structured query** over
   `events` / `data_releases` / `asset_reactions` (and later the analog engine).
2. The query runs against Postgres. Rows come back.
3. The model receives **only those rows** as context and writes prose over them.
4. The response cites the records it used, and the UI can display them.

A model must never supply a number, a date, or an event from its own memory.
Any number in the product must be traceable to a row a user can inspect.
Practically this favours tool-use with a constrained query surface over
free-form SQL generation, and requires that "no matching data" be a first-class
answer rather than something the model papers over.

Planned home: `src/services/ai/`, with the model client in `src/lib/`
alongside the other clients. Not before Phase 4.

---

## Future Python analytics layer

💭 **Conceptual — no Python exists in this repository.** No `.py` files, no
`requirements.txt`, no virtualenv, no runtime dependency.

The TypeScript stack is fine for ingestion, storage and serving. It is a poor
fit for the numerical work Phases 3 and 6 imply. If and when that work starts,
the likely shape is a separate batch service that reads and writes the same
Postgres database rather than a rewrite:

- **pandas / numpy** for time-series alignment and vectorised window math
- **scipy / statsmodels** for distributions, hypothesis tests, correlations
- **scikit-learn** for normalisation, clustering, regime classification
- Batch jobs computing features and similarity scores into materialised tables,
  which Next.js reads through Prisma like any other row

The boundary that keeps this clean: **Python writes derived tables, TypeScript
serves them.** No synchronous request path from the web app into Python.
`.gitignore` already covers `__pycache__/` and virtualenvs so this can be added
without touching git hygiene.

---

## Testing

❌ **None.** No test framework, no test files, no CI workflow.

📋 Recommended, in order:

1. **Vitest** for units. Fast, ESM-native, minimal config with a TS/Next
   project. The highest-value first targets are pure functions with real logic:
   `services/analytics/patternAnalysis.ts`, `scripts/ingest/compute-reactions.ts`
   (percentage and surprise math), and the query-parameter parsing in
   `/api/events`.
2. **`@testing-library/react`** for the interactive components — `EventBrowser`
   URL syncing is the one with real branching.
3. **Playwright** for end-to-end, once the UI reads real data. Not worth it
   while every page renders fixtures.
4. **GitHub Actions** running `typecheck`, `lint`, `test` on push. Note that
   `lint` currently fails on two pre-existing React-hooks errors, which must be
   fixed first.

No test dependency has been installed — that is a deliberate deferral, not an
oversight.

---

## Deployment

✅ Vercel. `.vercel/project.json` is present and gitignored; the git remote is
`github.com/chojona/ImpactFeedAI`.

Notes for a deploy that touches the database:

- Environment variables must be set in the Vercel project — `.env.local` is
  local-only.
- `prisma generate` must run in the build (Vercel does this automatically for
  Prisma projects; if it ever stops, add a `postinstall` script).
- Migrations should be applied with `npm run db:deploy`
  (`prisma migrate deploy`), never `migrate dev`.
- ⚠️ `@prisma/client` is currently in `devDependencies`. It works on Vercel
  because build-time installs include dev dependencies, but any deploy path
  using `npm install --omit=dev` would break at runtime. It belongs in
  `dependencies`.
- ⚠️ `dotenv` is imported by `prisma.config.ts` and every script but is not
  declared in `package.json`; it resolves today only as a transitive dependency
  of Prisma. It should be a direct `devDependency`.

---

## Conventions

From `CLAUDE.md`, and observed in the code:

- TypeScript `strict`, no `any`
- Functional components only; named exports for components
- `async`/`await`, never raw `.then()` chains
- Tailwind for all styling; inline styles only for dynamic values
- Mobile-first responsive
- Components under 150 lines — extract when longer. ⚠️ `src/app/page.tsx` is
  840 lines with fourteen section components inline; it should be split into
  `components/landing/`.
- Surprise direction always derives from `CATEGORY_CONFIG[category].higherIsBetter`,
  never from a raw `actual > expected` comparison.

### Where does new code go?

| Kind of code | Location |
| --- | --- |
| Route, page, layout | `src/app/` |
| Reusable UI | `src/components/<domain>/` |
| Third-party client, app config | `src/lib/` |
| Business logic, external-API service | `src/services/<domain>/` |
| Shared type used in more than one module | `src/types/` |
| Placeholder fixture | `src/lib/mock-data/` (and plan its removal) |
| One-off or scheduled job | `scripts/<category>/` |
| Small pure helper | inline near its use until a second caller appears, then `src/utils/` |
