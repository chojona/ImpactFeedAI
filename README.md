# ImpactFeedAI

A historical market research platform. ImpactFeedAI turns macroeconomic
releases and major news events into structured, searchable records of what
markets actually did afterwards — so a trader can study precedent instead of
guessing.

> **Status: early development.** The ingestion pipeline, the database schema and
> the web UI are wired together: every data-backed page and `/api/events` read
> Postgres.
> The placeholder fixtures are gone. Release timing and forecast provenance now
> fail closed: an unsourced timestamp cannot produce a market reaction, and an
> unsourced forecast is labelled unverified rather than treated as consensus.
> The largest remaining gap is authoritative historical timing and consensus
> coverage. See [docs/roadmap.md](docs/roadmap.md).

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

**Event reaction analysis** — for an event with a sourced exact release time,
how a set of instruments moved over defined windows after the release. The
current calculation supports 1 hour / 1 day / 1 week across 12 symbols. Events
with only an inferred time, a publication date, a reference period, or an
unverified timestamp deliberately show no reaction. A window that could not be
measured is stored and displayed as *null*, never as 0.00% — see
[Data integrity](#data-integrity).

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
| Tests | Vitest 4 (`npm test`) — unit only |
| CI | GitHub Actions (`.github/workflows/ci.yml`) |
| Deployment target | Vercel; local project-link metadata is not committed |

**Declared but currently unused:** `@anthropic-ai/sdk`. No AI calls exist in the
codebase yet. `axios` and `recharts` were declared but imported nowhere and have
been removed. **Not present:** Docker, Python, tRPC, component tests or
end-to-end tests.

---

## Project Structure

```
impactfeedai/
├── README.md
├── AGENTS.md / CLAUDE.md          # instructions for AI coding agents
├── .nvmrc                         # supported Node 22 line for local tools and CI
├── .github/workflows/ci.yml       # generate, validate and build on pushes/PRs
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
│   └── migrations/                # baseline + timing/provenance migration
│
├── scripts/
│   ├── lib/
│   │   ├── prisma.ts              # shared Prisma factory for scripts (DIRECT_URL)
│   │   └── readonly-prisma.ts     # write-blocking client used by every --dry-run
│   ├── ingest/                    # macro + price ingestion pipelines (has its own README)
│   ├── backfill/
│   │   └── backfill-prices.ts     # fills reactions for events ingested --no-prices
│   └── maintenance/
│       ├── verify-db.ts           # row counts and coverage check
│       ├── smoke-macro.ts         # live FRED transform sanity check
│       ├── smoke-dryrun-guard.ts  # proves a dry-run cannot write
│       ├── repair-data-releases.ts# recompute stored releases in canonical units
│       └── repair-reaction-timing.ts # remove legacy/unsafe reaction rows
│
├── tests/                         # Vitest unit tests (pure logic only)
│
├── public/                        # static assets
│
└── src/
    ├── app/                       # App Router
    │   ├── page.tsx               # landing page (hero, features, pricing)
    │   ├── feed/                  # event browser
    │   ├── events/[id]/           # event detail + cross-asset reaction
    │   ├── patterns/              # per-category aggregate reactions
    │   └── api/
    │       └── events/            # GET event list (reads Postgres)
    ├── components/
    │   ├── charts/                # ReactionPanel + lightweight-charts sparkline
    │   ├── events/                # browser, card, release stats, filter bar, search
    │   ├── landing/               # landing-page visuals
    │   ├── patterns/              # pattern card
    │   └── ui/                    # small shared primitives
    ├── lib/
    │   ├── prisma.ts              # Prisma client singleton + isDatabaseConfigured()
    │   ├── eventCategories.ts     # category colours, higherIsBetter, type↔category map
    │   └── assets.ts              # symbol → display name + asset class
    ├── services/
    │   ├── analytics/             # patternAnalysis.ts — aggregate reaction stats
    │   ├── events/                # queries, query-param parsing, row→UI mapper
    │   └── macro/                 # canonical metric registry + ET/DST timestamps
    ├── types/
    │   └── events.ts              # shared domain types
    └── generated/prisma/          # generated Prisma client (gitignored)
```

`src/server/` and `src/utils/` do not exist yet — nothing needs them. They'll be
added when there is real server-only logic or genuinely shared helpers, rather
than kept as empty scaffolding.

`src/services/macro/` holds the canonical metric registry. It lives under `src/`
rather than `scripts/` because both sides need it: the ingestion CLIs derive
values with it, and the web app uses it to render a stored number in the unit it
was stored in. A number without its unit is not a number.

---

## Getting Started

### Prerequisites

- **Node.js `^22.12.0` or `>=24.0.0`**. Node 23 is outside the declared range.
  `package.json` declares the range and `.nvmrc` selects Node 22 for local
  development and CI
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
cp .env.example .env
```

Fill in the values. Every variable is documented inline in
[.env.example](.env.example); the summary:

| Variable | Required | Used by |
| --- | --- | --- |
| `DATABASE_URL` | yes | the web app (`src/lib/prisma.ts`) — `/feed`, `/events/[id]` and `/patterns` return no data without it |
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

Most scripts fall back to `DATABASE_URL` when `DIRECT_URL` is unset. The
reaction-timing repair intentionally refuses that fallback in both preview and
apply modes and requires `DIRECT_URL`. Both URLs need `?sslmode=require`.

Any Postgres 14+ instance works for local development — nothing depends on Neon
specifically. Point both variables at it and run `npm run db:deploy`.

> Next.js reads both `.env` and `.env.local`; the standalone scripts use
> `dotenv/config`, which loads `.env` (plus variables already exported by the
> shell), not `.env.local`. Keep shared script/app values in `.env`. If you also
> add a Next-only `.env.local`, remember that it overrides `.env` for the app.

### Database setup

```bash
npm run db:generate     # generate the Prisma client into src/generated/prisma
npm run db:migrate      # create/apply migrations locally (prisma migrate dev)
```

`src/generated/prisma/` is gitignored, so **`npm run db:generate` is required
after a fresh clone and after schema changes** before typecheck. Dependency
installation does not generate this custom-output client: there is no
`postinstall` hook. The `build` script runs Prisma generation before Next.js;
CI also runs it explicitly before typecheck.

In a deployed environment use `npm run db:deploy` (`prisma migrate deploy`)
instead of `db:migrate`.

### Development server

```bash
npm run dev             # http://localhost:3000
```

The landing page renders without a database. `/feed`, `/events/[id]` and
`/patterns` read Postgres, so they need `DATABASE_URL` and an ingested library:

- **No `DATABASE_URL`** — `/api/events` returns `503 database_not_configured`
  with an actionable message, and `/patterns` says so on the page. It does not
  silently render as "no results".
- **`DATABASE_URL` set but nothing ingested** — the feed shows an empty-library
  state naming the command that fills it.

### Loading real data

This is now required to see anything in the feed.

```bash
npm run ingest:dry-run  # reads the DB (so dedup runs) + fetches, writes nothing
npm run ingest          # write ~51 curated events to Postgres (idempotent)

npm run auto-ingest -- --no-prices --since 2020-01-01   # bulk macro metadata, ~15 min
npm run db:verify                                       # row counts + coverage
```

The legacy curated timestamps have no retained citation and therefore default
to `UNVERIFIED`. Bulk FRED/BLS rows have only a reference period, and the FOMC
source has only an inferred announcement date. All three paths persist the
event/release metadata but suppress Yahoo fetching. Populate a sourced exact
`releaseAt`, set `timingStatus` to `VERIFIED` or `SCHEDULED`, and record a
non-empty `timingSource` before running `npm run backfill:prices`.

Both dry-runs **connect to the database and read from it** — that is what makes
them meaningful, because deduplication is the most failure-prone step and a
dry-run that skipped it would not predict the real run. Writes are blocked by a
Prisma client extension rather than by convention, so there is no code path that
can write through a dry-run client. `npm run smoke:dryrun` proves it.

See [scripts/ingest/README.md](scripts/ingest/README.md) for the full flag list,
the failure model, and expected runtimes.

### Build and quality checks

```bash
npm run build           # production build
npm run start           # serve the production build
npm run typecheck       # tsc --noEmit
npm run lint            # eslint
npm run test            # vitest run
npm run verify          # typecheck + lint + test
npm run db:validate     # validate schema/config without contacting a database
```

None of these checks need a database. GitHub Actions runs `npm ci`, explicitly
generates the Prisma client, then runs typecheck, lint, unit tests, schema
validation and a production build on every push and pull request. The workflow
does not inject database or provider secrets.

### Testing

**Vitest**, unit tests only, in `tests/`. `npm test` runs them; they need no
database, no network and no browser.

Coverage is deliberately concentrated where a bug becomes *wrong data* rather
than a wrong pixel:

| Suite | Covers |
| --- | --- |
| `metrics.test.ts` | YoY / QoQ-annualised / MoM transforms, surprise arithmetic, unit formatting, registry integrity |
| `fetch-prices.test.ts` | calculation-v2 pre-release baselines and release-relative windows across pre-market, intraday, after-hours and weekend cases |
| `time.test.ts` | 08:30 and 14:00 ET across both DST transitions |
| `timing.test.ts` | fail-closed timing eligibility and timing labels |
| `source-timing.test.ts` | FRED/BLS reference-period semantics and inferred FOMC timing |
| `release-calendar.test.ts` | source-agnostic official timing boundary, normalized release stages and date-only non-promotion |
| `consensus.test.ts` / `fetchMacroConsensus.test.ts` | source/as-of validation, look-ahead rejection and seed-status promotion rules |
| `reactionRepair.test.ts` | deterministic cleanup scope and repair idempotence |
| `mapEvent.test.ts` | row→UI mapping, null propagation, category mapping |
| `patternAnalysis.test.ts` | aggregation over measured moves only, sample sizes |
| `queryParams.test.ts` | `/api/events` parameter validation and clamping |

Still outstanding: component tests (`@testing-library/react`) and end-to-end
tests (Playwright). See [docs/architecture.md](docs/architecture.md#testing).

### Troubleshooting

**`UNABLE_TO_VERIFY_LEAF_SIGNATURE` on `npm install` or during ingestion.**
Machine-specific TLS interception. Use the `--use-system-ca` flag:

```bash
node --use-system-ca ./node_modules/.bin/tsx scripts/ingest/ingest.ts
```

> Do **not** put it in `NODE_OPTIONS`. `--use-system-ca` is not on Node's
> allowlist for that variable, so `NODE_OPTIONS=--use-system-ca npm install`
> fails immediately with `node: --use-system-ca is not allowed in NODE_OPTIONS`
> and installs nothing — it looks like a network problem and is not one. The flag
> also only exists from Node 22.15; on older versions use `NODE_EXTRA_CA_CERTS`
> pointing at your corporate root certificate instead.

**`Cannot find module '@/generated/prisma/client'`** — run `npm run db:generate`.

**Prisma cannot reach the database** — check that `DATABASE_URL` /
`DIRECT_URL` are set and include `?sslmode=require`. Neon free-tier projects
auto-suspend when idle, so the first query after a pause takes a moment to wake
the compute; that is normal, not a failure. The landing page is static, but the
feed, event-detail and pattern routes all need the application connection.

---

## Current Status

Early development, pre-MVP.

**Working today**
- Landing page (hero, features, pricing) — static, no signup flow
- Event browser with category filter, full-text search, two sorts and infinite
  scroll — reading Postgres through `/api/events`
- Event detail: provenance-labelled expectation vs. actual in canonical units,
  plus a cross-asset reaction only when release timing is eligible
- Pattern library: per-category aggregates with per-asset sample sizes
- Ingestion pipelines for ~51 curated events and bulk FRED / BLS / FOMC
  history; untrusted timing is retained as metadata but never priced
- A timing-gated, idempotent price backfill and a dry-run-first legacy-reaction
  repair
- Provider contracts for authoritative historical release calendars and
  sourced consensus; no external provider adapters are wired yet
- Prisma schema and migrations for timing, provenance, consensus, reactions
  and data releases
- Vitest unit suite over macro, timing, consensus, price and mapping logic
- Secret-free GitHub Actions CI for generate, typecheck, lint, test, schema
  validation and build

**Not built yet**
- **Authoritative timing and consensus sources.** FRED/BLS time-series
  endpoints publish reference periods and actuals, not historical release
  instants or market consensus. Hand-entered expectations remain explicitly
  `UNVERIFIED`; bulk rows have `MISSING` consensus
- **Animated intraday replay.** Four prices per asset are stored, not candles,
  so there is no series to replay. The detail page shows the measured windows
  instead
- Market context (VIX, yields, trend, regime), similarity scoring, AI layer,
  authentication and payments

---

## Data integrity

Financial data has a specific failure mode: a wrong number looks exactly like a
right one. These rules are enforced in code and surfaced in the UI:

**The reaction clock is fail-closed.** `occurredAt` remains a required
compatibility/display timestamp; it is not a reaction anchor. `releaseDate` is
a calendar date, and `referencePeriodStart` is the period a statistic measures.
Only `releaseAt` represents the exact market-facing instant. Reactions are
created and exposed only when it is non-null, `timingStatus` is `VERIFIED` or
`SCHEDULED`, and `timingSource` is non-empty. `INFERRED`, `DATE_ONLY`,
`REFERENCE_PERIOD_ONLY` and `UNVERIFIED` records fail closed.

**A stored reaction is auditable.** `AssetReaction.anchorAt` records the actual
provider candle used as the baseline. `calculationVersion` identifies the
calculation semantics; the app excludes legacy or mismatched versions from
event views, pattern aggregates and “biggest move” ranking.

**The denominator is strictly pre-release.** Calculation version 2 prefers the
most recent usable intraday open strictly before `releaseAt` (at most two hours
old), then falls back to the immediately preceding session's close (provider
bar at most four calendar days old). A first post-release candle is never the
baseline, so pre-market and weekend gaps remain part of the reaction. The 1-hour
endpoint is relative to `releaseAt`; 1-day and 1-week endpoints are relative to
the release session. If a bounded baseline or endpoint cannot be measured, the
value is null, never a fabricated 0.00%.

For a daily-close fallback, `anchorAt` is Yahoo's daily-bar timestamp (normally
the session-open stamp), because the payload has no separate close timestamp.
It identifies the source bar but must not be presented as an exact closing tick.

**Every value in a release row shares one unit.** `expectedValue`, `actualValue`,
`priorValue` and `surpriseMagnitude` are all in the canonical unit declared for
that metric in `src/services/macro/metrics.ts`, and `metricName` is the key that
resolves a stored number back to its unit. Percentage surprises are quoted in
percentage *points*: a 2.4% consensus printing 2.3% is −0.1pp, not −0.1%.

**Provenance is part of the value.** New source-backed actuals carry
`actualSource` and `actualSourceUrl`; migrated legacy rows remain null rather
than receiving guessed attribution. Forecasts carry a `consensusStatus`, source,
URL and as-of instant. A complete sourced forecast validated against a trusted
release instant is `VERIFIED`, a legacy/hand-entered value without complete
provenance is `UNVERIFIED`, and no forecast is `MISSING`. Only a verified one is
presented as consensus/surprise without a warning.

**Absence is not a comparison.** A print with no prior observation renders
without a comparison clause, rather than as "in line with prior" — BLS collected
no October 2025 unemployment figure, and the November print must not claim to
match a number that does not exist.

### Repairing legacy reaction rows

The timing/provenance migration does not guess which old timestamps were valid,
and it does not delete old reactions. Preview the rows that the current policy
will hide:

```bash
npm run repair:reaction-timing:dry-run
```

Both preview and apply require the direct `DIRECT_URL`; this maintenance tool
never falls back to the pooled application URL. Applying deletes only reactions
whose event timing is ineligible or whose `calculationVersion` is legacy. It
never changes an `Event` or `DataRelease` and has two additional safety gates:

```bash
REACTION_REPAIR_CONFIRM=DELETE_UNTRUSTED_OR_LEGACY_REACTIONS \
  npm run repair:reaction-timing -- --apply --all
```

After review, use the event-scoped command printed for each eligible event,
`npm run backfill:prices -- --event-id <uuid>`. Rows on untrusted events stay
absent until authoritative timing is added. Both operations are idempotent.

---

## Disclaimer

ImpactFeedAI is a **research and educational platform**. It does not provide
financial, investment, or trading advice, and it does not generate trade
signals or execute orders. Historical market behaviour does not predict future
results. Data is sourced from third-party providers and may be incomplete,
delayed, revised, or wrong. Any decision you make with it is your own.
