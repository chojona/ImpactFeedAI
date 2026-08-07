# Historical event ingestion

One-shot pipeline that seeds the Postgres database with ~50 curated macro events
plus the cross-asset price reaction and FRED data release for each one.

This is **not** a live feed. Run it once to bootstrap the database, then again
whenever new events are added to [`events-seed.ts`](./events-seed.ts).
Re-runs are idempotent — events already in the DB are skipped.

---

## Setup

The pipeline is TypeScript and runs against the existing Prisma schema. No
Python toolchain is required.

```bash
# Install deps if you haven't (the project already has Prisma + Next; this
# step only matters on a fresh clone)
npm install

# Apply the migration that creates events / asset_reactions / data_releases.
npx prisma migrate deploy
```

Environment variables (set in `.env.local` or `.env`):

| Var             | Required | Purpose                                                 |
| --------------- | -------- | ------------------------------------------------------- |
| `DATABASE_URL`  | yes      | Postgres connection string. Same one Prisma uses.       |
| `FRED_API_KEY`  | no       | Free key from <https://fred.stlouisfed.org/docs/api/api_key.html>. Without it, `DataRelease` rows only get the manually-curated `expectedValue` from `events-seed.ts` — actual/prior come from FRED. `auto-ingest` skips its FRED and FOMC sources entirely without it. |
| `BLS_API_KEY`   | no       | Free key from <https://data.bls.gov/registrationEngine/>. Only raises the daily request cap (25 → 500) for `auto-ingest --source bls`. |

> Ingested rows are **not displayed anywhere in the UI yet** — the app still
> renders `src/lib/mock-data/`. To inspect what landed in the database, run
> `npm run db:verify` (`scripts/maintenance/verify-db.ts`).

> **Cert note (this machine).** `npm` and outbound HTTPS from Node fail with
> `UNABLE_TO_VERIFY_LEAF_SIGNATURE` unless you set `NODE_OPTIONS=--use-system-ca`.
> The npm scripts below do **not** apply that flag — set it in your shell first
> or prefix each command:
>
> ```bash
> NODE_OPTIONS=--use-system-ca npm run ingest
> ```

---

## Run

```bash
# Real run — writes to the DB
npm run ingest

# Dry run — fetches + prints, never writes (works without DATABASE_URL)
npm run ingest:dry-run

# Single category, useful for spot-checking
npx tsx scripts/ingest/ingest.ts --event-type CPI

# Smoke test: one event, no DB writes
npx tsx scripts/ingest/ingest.ts --dry-run --event-type CPI --limit 1
```

All flags:

```
--dry-run             Fetch + print, write nothing.
--event-type <type>   TARIFF | FED_DECISION | CPI | PPI | NFP |
                      GEOPOLITICAL | EARNINGS_SURPRISE | MACRO_DATA
--limit <n>           Process at most n events (after filters).
-h, --help            Show help.
```

Expected runtime: **2–3 minutes** for the full 50 events. Bottleneck is the
500 ms / symbol delay × 12 symbols × 50 events = ~5 minutes of Yahoo wait time,
plus 1 s between events. If Yahoo throttles you'll see warnings; the pipeline
continues regardless.

---

## What it does

For each event in [`events-seed.ts`](./events-seed.ts):

1. **Idempotency.** Skip if `(headline, occurred_at)` is already in `events`.
2. **Prices.** For all 12 symbols in `ASSET_UNIVERSE`, fetch a Yahoo `chart`
   window around the event time. Resolve four prices:
   - `priceAtEvent` — first candle at or after the event timestamp
   - `price_1h`     — first candle at or after t+1h (intraday only)
   - `price_1d`     — first daily candle at or after t+1d
   - `price_1w`     — first daily candle at or after t+7d
   - Compute `pct_change_*` from those.
3. **Macro.** If the event type is CPI/PPI/NFP/FED_DECISION, fetch the actual
   and prior values from FRED. If the seed entry includes an `expectedValue`,
   compute the surprise. Either source alone produces a `DataRelease` row.
4. **Persist** as a single Prisma transaction:
   - 1 `Event` row
   - 0–12 `AssetReaction` rows (skipped per-asset only when Yahoo fails to
     produce even an anchor price)
   - 0–1 `DataRelease` row

### Best-effort failure model

- A symbol that errors → null fields + warning + continue.
- A symbol with no anchor price at all → row skipped, warning, continue.
- FRED 4xx/5xx → log + continue without macro.
- DB transaction failure → log, mark event as failed, continue to next event.
- Pipeline only halts on totally unrecoverable errors (missing `DATABASE_URL`,
  unparseable timestamp on a seed row, etc.).

Re-run as needed — events that succeeded won't be re-fetched.

---

## Files

| File                    | Job                                                            |
| ----------------------- | -------------------------------------------------------------- |
| `events-seed.ts`        | The 50 hand-curated seed events + `ASSET_UNIVERSE`             |
| `fetch-prices.ts`       | Yahoo Finance window fetcher (intraday + daily, with fallback) |
| `fetch-macro.ts`        | FRED series fetcher (actual + prior)                           |
| `compute-reactions.ts`  | `% change` math + surprise magnitude                           |
| `types.ts`              | Shared types between modules                                   |
| `ingest.ts`             | CLI orchestrator                                               |

## Schema

See `prisma/schema.prisma`:

- `Event` — `id`, `headline`, `eventType` (enum), `occurredAt`, `sourceUrl`,
  `explanation` (null until an AI step fills it), `createdAt`. Unique on
  `(headline, occurredAt)`.
- `AssetReaction` — FK to `Event`, `assetSymbol`, anchor + three timeframe
  prices and percent changes. Unique on `(eventId, assetSymbol)`.
- `DataRelease` — FK to `Event`, `metricName`, expected/actual/prior, and
  computed surprise. Unique on `(eventId, metricName)`.

## Adding more events

Edit `events-seed.ts` and re-run `npm run ingest`. New entries are appended;
existing ones are no-ops thanks to the idempotency check.

For data releases where you want a surprise calculation, fill in `expectedValue`
in the seed entry (FRED only ships actuals). Optionally set `metricName` to
override the default series label.

---

## Automated ingestion (`auto-ingest`)

`scripts/ingest/auto-ingest.ts` is a separate pipeline that bulk-loads
structured macro events from FRED, BLS, and the FOMC rate-decision history.
It writes to the same tables as `ingest.ts` but is fully automated — no
hand-curated seed list. Use it to backfill 1,000–2,000+ rows after the seed
has run.

### Sources

| Source | What it produces                                                       |
| ------ | ---------------------------------------------------------------------- |
| FRED   | 11 series: CPI, Core CPI, PPI, NFP, UNRATE, FEDFUNDS, PCE, Core PCE, GDP, UMich Sentiment, JOLTS. One Event per observation with per-series headline transforms (YoY %, MoM Δ, level %, QoQ annualised). |
| BLS    | 4 series direct from the Bureau of Labor Statistics: CPI-U, Core CPI-U, Total Nonfarm Payroll, Unemployment Rate. Paginated 10 years per request. |
| FOMC   | One Event per actual rate decision since `--since`. Walks the daily `DFEDTARU` series and emits raises/cuts on every step change. **Hold meetings are not captured** — see below. |

### Run

```bash
# All sources, prices included — 4-5 hours
npm run auto-ingest

# Event metadata only, no Yahoo fetches — ~15 minutes
npm run auto-ingest -- --no-prices

# Recommended first run on a fresh DB:
npm run auto-ingest:dry-run                      # validates plumbing
npm run auto-ingest -- --no-prices               # load event metadata fast
npm run auto-ingest                              # backfill prices in a second pass
                                                  #   (dedup keeps the events; prices land via skipped duplicates)
                                                  #   NB: currently a re-run won't add prices to already-inserted
                                                  #   events — duplicates are skipped entirely. See "Backfilling
                                                  #   prices later" below.
```

All flags:

```
--source <fred|bls|fomc>    Restrict to one source (default: all).
--dry-run                   Fetch + count, write nothing.
--since <YYYY-MM-DD>        Earliest event date (default 2000-01-01).
--no-prices                 Skip Yahoo fetching.
-h, --help                  Show help.
```

### Dedup

Before inserting, the orchestrator checks for an existing Event with the
**same `event_type`** within **±1 calendar day** of `occurred_at`. This:

- Prevents double-inserts on re-runs of auto-ingest itself
- Avoids creating mechanical duplicates of the 50 curated seed events
- Catches FRED ↔ BLS overlap (both ship CPI / unemployment)

If a hash collision still slips past (e.g. revision with a new observation
date on the same day), the Postgres `(headline, occurred_at)` unique
constraint catches it and the event is logged as skipped.

### What the spec says vs what got built

The original spec asked for FRED `release_id=82` for FOMC meeting dates.
That endpoint actually returns the H.15 release publication schedule —
**3 dates total** since 2023, not the 24 meetings we need. The
implementation switched to walking the `DFEDTARU` daily series and emitting
events on every step change. Side effect: **hold meetings are excluded**
(they produce no rate change). For target-rate accuracy this is the right
trade — every raise/cut event has the correct target rate and meeting date.

The spec also wrote `event_type: "cpi"` lowercase; the schema uses uppercase
`EventType` enum values (`"CPI"`, `"FED_DECISION"`, etc.). The code maps
to the schema values.

The spec named JOLTS as series ID `JOLTS`; the actual FRED ID is `JTSJOL`.
Used the real one.

### Backfilling prices later

Currently, a re-run with `--no-prices` followed by a re-run without it
**does not** add prices to already-inserted events — dedup skips them
entirely. If you want to backfill prices after a metadata-only run, the
cleanest path is a dedicated backfill script that walks events with no
`AssetReaction` rows and calls `fetchPriceSnapshot` per asset. Easy to
add; not in scope yet.

### Expected scale

For `--since 2000-01-01`:

| Source | Events (approx)                              |
| ------ | -------------------------------------------- |
| FRED   | ~1,600 — 11 series, mostly monthly, 25 years |
| BLS    | ~1,000 — 4 series, monthly, deduped vs FRED  |
| FOMC   | ~150 — rate decisions only                   |
| **Total after dedup** | ~2,000–2,500                   |

For `--since 2024-01-01` (verified): ~308 candidates per dry-run.