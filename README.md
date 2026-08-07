# ImpactFeedAI

A historical market research platform. ImpactFeedAI turns macroeconomic
releases and major news events into structured, searchable records of what
markets actually did afterwards — so a trader can study precedent instead of
guessing.

> **Status: early development.** The ingestion pipeline and database schema are
> real and working. The web UI still renders from hand-written placeholder data
> (`src/lib/mock-data/`). Connecting the two is the current priority — see
> [docs/roadmap.md](docs/roadmap.md).

---

## Vision

ImpactFeedAI exists to answer one question:

> **When similar market and macroeconomic conditions occurred in the past, what happened next?**

Most tools show a single variable in isolation: a CPI print, a chart, a VIX
level. Traders don't experience markets that way. A hot CPI print in a
restrictive Fed regime with elevated volatility and equities near highs is a
different event from the same print in an easing cycle after a drawdown — even
though the headline number is identical.

The platform's job is to hold those variables *together*: macro release, rate
environment, volatility, trend, market structure, positioning — and find the
historical periods where the combination looked similar. A historical analog
becomes meaningful when multiple independent factors align, not when one number
matches.

Full write-up: [docs/vision.md](docs/vision.md).

---

## Core Concepts

**Historical event database** — a structured record of macro releases and market
events: what was expected, what printed, when, and from which source. This is
the foundation everything else reads from.

**Event reaction analysis** — for each event, how a set of instruments moved over
defined windows after the release. Currently 1 hour / 1 day / 1 week across 12
symbols; more windows and instruments are planned.

**Historical analog search** *(planned)* — given today's conditions, score past
periods for similarity across several feature families and return the closest
matches, with their subsequent outcomes.

**AI research assistant** *(planned)* — natural-language querying over the stored
data. The model retrieves, compares, and explains records; it does not invent
history. The database is the source of truth.

---

## Example Workflow

*(Illustrative — the analog engine is not built yet.)*

A CPI release prints above expectations. ImpactFeedAI would eventually evaluate:

| Input | Example |
| --- | --- |
| CPI actual | 3.0% YoY |
| CPI forecast | 2.9% YoY |
| Surprise | +0.1pp, normalized against historical surprise dispersion |
| Inflation trend | Re-accelerating for 2 months |
| Fed policy regime | Restrictive, on hold |
| Treasury yields | 10y rising, curve flattening |
| VIX | 21, above 3-month average |
| Equity trend | SPX within 2% of all-time high |
| Market structure | Above prior week's value area |
| Positioning | *(future)* dealer gamma, options skew, COT |

It then searches for historical CPI releases where that combination looked
similar, and reports what SPX / NQ / ES / yields / VIX did over the following
hours and days — as a distribution with a sample size, not a single answer.

---

## Research Philosophy

**Historical analogs are evidence, not predictions.**

- Markets do not repeat exactly. Regimes shift, participants change, structure
  evolves.
- A sample of 6 similar events is a hint. A sample of 60 is an argument. Neither
  is a forecast.
- The platform's output is a distribution of outcomes with its sample size and
  its caveats attached — never a single deterministic number, a signal, or an
  order.
- The goal is to help a trader form and test hypotheses, and to surface evidence
  that *contradicts* a hypothesis just as readily as evidence that supports it.

Methodology, including the biases this design has to defend against:
[docs/research-methodology.md](docs/research-methodology.md).

---

## Potential Data Categories

**Macroeconomic** — CPI, PPI, NFP, PCE, GDP, Retail Sales, Jobless Claims, FOMC
decisions. *(CPI, Core CPI, PPI, NFP, unemployment, Fed funds, PCE, Core PCE,
GDP, UMich sentiment and JOLTS already have ingestion paths.)*

**Market** — SPX, NQ, ES, Treasury yields, VIX. *(Today the pipeline captures 12
ETF/futures proxies: SPY, QQQ, IWM, TLT, GLD, GC=F, CL=F, DX-Y.NYB, BTC-USD,
XLE, XLF, XLK. No VIX or yield series yet.)*

**Advanced / future** — options positioning, dealer gamma exposure, order flow,
volume profile, open interest, COT / positioning data.

Source-by-source inventory with status and licensing notes:
[docs/data-sources.md](docs/data-sources.md).

---

## Current Tech Stack

Everything listed here is confirmed present in the repository.

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16.2.6 (App Router) |
| UI | React 19.2, TypeScript 5 (`strict`) |
| Styling | Tailwind CSS v4 (via `@tailwindcss/postcss`) |
| Charts | `lightweight-charts` 5.2 |
| Animation | `framer-motion` 12 |
| Icons | `lucide-react` |
| Database | Neon PostgreSQL |
| ORM | Prisma 7.8 with `@prisma/adapter-pg` (driver adapter required — `PrismaClient` has no zero-arg constructor) |
| Market data | `yahoo-finance2` (ingestion scripts only) |
| Macro data | FRED and BLS REST APIs (`fetch`, no SDK) |
| Script runner | `tsx` |
| Linting | ESLint 9 + `eslint-config-next` |
| Deployment | Vercel (`.vercel/project.json` present) |

**Declared but currently unused:** `@anthropic-ai/sdk`, `axios`, `recharts`.
No AI calls exist in the codebase yet. **Not present:** test framework, CI
pipeline, Docker, Python, tRPC.

---

## Project Structure

```
impactfeedai/
├── README.md
├── AGENTS.md / CLAUDE.md          # instructions for AI coding agents
├── .env.example                   # every env var the code reads
├── next.config.ts, tsconfig.json, eslint.config.mjs, postcss.config.mjs
├── prisma.config.ts               # Prisma 7 config (schema path + datasource)
│
├── docs/
│   ├── vision.md                  # why this exists, who it's for, non-goals
│   ├── architecture.md            # what is built vs. planned, layer by layer
│   ├── data-sources.md            # source inventory + status
│   ├── research-methodology.md    # analog methodology and its failure modes
│   └── roadmap.md                 # phased plan
│
├── prisma/
│   ├── schema.prisma              # Event, AssetReaction, DataRelease
│   └── migrations/                # single clean baseline (20260512194452_init)
│
├── scripts/
│   ├── lib/prisma.ts              # shared Prisma factory for scripts (DIRECT_URL)
│   ├── ingest/                    # macro + price ingestion pipelines (has its own README)
│   └── maintenance/
│       └── verify-db.ts           # row counts and coverage check
│
├── public/                        # static assets
│
└── src/
    ├── app/                       # App Router
    │   ├── page.tsx               # landing page (hero, features, pricing)
    │   ├── feed/                  # event browser
    │   ├── events/[id]/           # event detail + chart replay
    │   ├── patterns/              # per-category aggregate reactions
    │   └── api/
    │       └── events/            # GET event list (serves placeholder data today)
    ├── components/
    │   ├── charts/                # lightweight-charts wrappers, replay panel
    │   ├── events/                # browser, card, filter bar, search
    │   ├── landing/               # landing-page visuals
    │   ├── patterns/              # pattern card
    │   └── ui/                    # small shared primitives
    ├── lib/
    │   ├── prisma.ts              # Prisma client singleton
    │   ├── eventCategories.ts     # category colours + higherIsBetter config
    │   └── mock-data/             # PLACEHOLDER fixtures the UI renders today
    ├── services/
    │   └── analytics/             # patternAnalysis.ts — aggregate reaction stats
    ├── types/
    │   └── events.ts              # shared UI-facing domain types
    └── generated/prisma/          # generated Prisma client (gitignored)
```

`src/server/` and `src/utils/` do not exist yet — nothing needs them. They'll be
added when there is real server-only logic or genuinely shared helpers, rather
than kept as empty scaffolding.

---

## Getting Started

### Prerequisites

- **Node.js 20+** (Next 16 / React 19)
- **PostgreSQL** — a [Neon](https://neon.tech) project (what this repo uses), or any Postgres 14+ instance
- Optional API keys: [FRED](https://fred.stlouisfed.org/docs/api/api_key.html)
  (macro data), [BLS](https://data.bls.gov/registrationEngine/) (higher BLS
  rate limit)

### Installation

```bash
git clone https://github.com/chojona/ImpactFeedAI.git
cd ImpactFeedAI
npm install
```

### Environment setup

```bash
cp .env.example .env.local
```

Fill in the values. Every variable is documented inline in
[.env.example](.env.example); the summary:

| Variable | Required | Used by |
| --- | --- | --- |
| `DATABASE_URL` | yes | the web app (`src/lib/prisma.ts`) |
| `DIRECT_URL` | yes | Prisma CLI/migrations, ingestion scripts, maintenance scripts |
| `FRED_API_KEY` | for macro ingestion | `scripts/ingest/` |
| `BLS_API_KEY` | no | raises BLS daily cap from 25 to 500 |

The database is hosted on **Neon**, which exposes a **pooled** endpoint
(hostname contains `-pooler.`) and a **direct** endpoint (without it). The
split is by *consumer*, not by environment — set both variables the same way
locally and on Vercel:

| Consumer | Variable | Endpoint | Why |
| --- | --- | --- | --- |
| Web app | `DATABASE_URL` | **pooled** | many short-lived serverless connections |
| Prisma CLI / migrations | `DIRECT_URL` | **direct** | advisory locks break under transaction-mode pooling |
| Ingestion + maintenance scripts | `DIRECT_URL` | **direct** | long interactive transactions, one process |

Scripts fall back to `DATABASE_URL` when `DIRECT_URL` is unset. Both URLs need
`?sslmode=require`.

> Next.js reads `.env.local` in preference to `.env`, while the ingestion
> scripts load only `.env`. This project keeps a single `.env` so both see the
> same database; if you add `.env.local`, keep `DATABASE_URL` identical in
> each.

### Database setup

```bash
npm run db:generate     # generate the Prisma client into src/generated/prisma
npm run db:migrate      # create/apply migrations locally (prisma migrate dev)
```

`src/generated/prisma/` is gitignored, so **`npm run db:generate` is required
after a fresh clone** — typecheck and build fail without it.

In a deployed environment use `npm run db:deploy` (`prisma migrate deploy`)
instead of `db:migrate`.

### Development server

```bash
npm run dev             # http://localhost:3000
```

The landing page, `/feed`, `/events/[id]` and `/patterns` all work without a
database — they render placeholder data. Nothing in the running app reads or
writes Postgres today; only the ingestion scripts do.

### Loading real data (optional)

```bash
npm run ingest:dry-run  # fetch + print ~51 curated events, write nothing
npm run ingest          # write them to Postgres (2–3 min, idempotent)

npm run auto-ingest -- --no-prices --since 2020-01-01   # bulk macro metadata
npm run db:verify                                       # row counts + coverage
```

See [scripts/ingest/README.md](scripts/ingest/README.md) for the full flag list,
the failure model, and expected runtimes. Note that ingested data is **not yet
displayed anywhere in the UI**.

### Build and quality checks

```bash
npm run build           # production build
npm run start           # serve the production build
npm run typecheck       # tsc --noEmit
npm run lint            # eslint
```

> `npm run lint` currently reports 2 pre-existing React-hooks errors in
> `AssetChart.tsx` and `EventBrowser.tsx`. They do not break the app but should
> be fixed before lint is wired into CI.

### Testing

There is **no test framework in the project yet**. The recommendation is Vitest
plus `@testing-library/react` for units, and Playwright later for end-to-end;
see [docs/architecture.md](docs/architecture.md#testing) for the rationale and
the first functions worth covering. No test dependency has been installed.

### Troubleshooting

**`UNABLE_TO_VERIFY_LEAF_SIGNATURE` on `npm install` or during ingestion.**
Machine-specific TLS interception. Prefix commands with
`NODE_OPTIONS=--use-system-ca`:

```bash
NODE_OPTIONS=--use-system-ca npm install
NODE_OPTIONS=--use-system-ca npm run ingest
```

**`Cannot find module '@/generated/prisma/client'`** — run `npm run db:generate`.

**Prisma cannot reach the database** — check that `DATABASE_URL` /
`DIRECT_URL` are set and include `?sslmode=require`. Neon free-tier projects
auto-suspend when idle, so the first query after a pause takes a moment to wake
the compute; that is normal, not a failure. Only the ingestion and maintenance
scripts touch the database today — the web app still runs without it.

---

## Current Status

Early development, pre-MVP.

**Working today**
- Landing page (hero, features, pricing) — static, no signup flow
- Event browser, event detail with animated chart replay, pattern library — all
  rendering from `src/lib/mock-data/` (12 hand-written events)
- Ingestion pipelines for ~51 curated events (prices + FRED releases) and for
  bulk FRED / BLS / FOMC history
- Prisma schema and migrations for events, asset reactions and data releases

**Not built yet**
- Any connection between the database and the UI — `/api/events` serves
  placeholder data
- Market context (VIX, yields, trend, regime), similarity scoring, AI layer,
  authentication, payments, tests, CI

---

## Disclaimer

ImpactFeedAI is a **research and educational platform**. It does not provide
financial, investment, or trading advice, and it does not generate trade
signals or execute orders. Historical market behaviour does not predict future
results. Data is sourced from third-party providers and may be incomplete,
delayed, revised, or wrong. Any decision you make with it is your own.
