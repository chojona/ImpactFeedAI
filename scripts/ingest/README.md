# Historical event ingestion

One-shot pipeline that seeds Postgres with ~50 curated events and, where
available, a FRED data release. Cross-asset reactions are conditional on
authoritative release timing. The legacy seed list has plausible timestamps but
no retained timing citations, so its entries currently ingest as `UNVERIFIED`
and deliberately produce no reactions.

This is **not** a live feed. Run it once to bootstrap the database, then again
whenever new events are added to [`events-seed.ts`](./events-seed.ts).
Re-runs are idempotent — events already in the DB are skipped.

---

## Setup

The pipeline is TypeScript and runs against the existing Prisma schema. No
Python toolchain is required. Use Node `^22.12.0` or `>=24.0.0`; `.nvmrc`
selects Node 22 and Node 23 is outside the declared range.

```bash
# Install deps if you haven't (the project already has Prisma + Next; this
# step only matters on a fresh clone)
npm install

# The generated client is gitignored and there is no postinstall hook.
npm run db:generate

# Apply the checked-in migrations.
npm run db:deploy
```

Environment variables (set in `.env` or exported by the shell):

| Var             | Required | Purpose                                                 |
| --------------- | -------- | ------------------------------------------------------- |
| `DIRECT_URL`    | recommended | Postgres connection string, Neon's **direct** endpoint. Preferred by `scripts/lib/prisma.ts`; the timing repair requires it. |
| `DATABASE_URL`  | fallback | Used by normal ingestion/maintenance scripts only when `DIRECT_URL` is absent; one of the two must be set. |
| `FRED_API_KEY`  | no       | Free key from <https://fred.stlouisfed.org/docs/api/api_key.html>. Without it, curated rows can contain only a manually entered expectation (actual/prior stay null), and `auto-ingest` skips FRED and FOMC entirely. |
| `BLS_API_KEY`   | no       | Free key from <https://data.bls.gov/registrationEngine/>. Only raises the daily request cap (25 → 500) for `auto-ingest --source bls`. |

The standalone CLIs import `dotenv/config`, which loads `.env`, not
`.env.local`. Next.js may use `.env.local`, but it does not configure these
scripts unless the same variables are also exported in the shell.

> Ingested rows **are** what the UI displays: `/feed`, `/events/[id]` and
> `/patterns` read these tables. An empty database means an empty feed. To inspect
> what landed, run `npm run db:verify` (`scripts/maintenance/verify-db.ts`).

> **Cert note.** If outbound HTTPS from Node fails with
> `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (corporate TLS interception), pass
> `--use-system-ca` to `node` directly:
>
> ```bash
> node --use-system-ca ./node_modules/.bin/tsx scripts/ingest/ingest.ts
> ```
>
> It cannot go in `NODE_OPTIONS` — that variable has an allowlist and
> `--use-system-ca` is not on it, so `NODE_OPTIONS=--use-system-ca npm run ingest`
> aborts with `node: --use-system-ca is not allowed in NODE_OPTIONS` and runs
> nothing. The flag also requires Node 22.15+; on older versions set
> `NODE_EXTRA_CA_CERTS` to your root certificate instead.

---

## Run

```bash
# Real run — writes to the DB
npm run ingest

# Dry run — reads the DB (so dedup is exercised) + fetches, but never writes.
# Writes are blocked by a Prisma client extension, not by convention:
# scripts/lib/readonly-prisma.ts. Verify with `npm run smoke:dryrun`.
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

With the current unverified seed timing, Yahoo is never called; runtime is the
FRED work plus the 1-second inter-event delay. Each entry later promoted to
reaction-eligible timing adds at least 6 seconds of per-symbol rate limiting,
plus provider latency and any Yahoo backoff.

---

## What it does

For each event in [`events-seed.ts`](./events-seed.ts):

1. **Idempotency.** Prefer the deterministic curated `eventKey`; retain the
   seed's unique headline as a compatibility check for legacy rows, so a later
   timestamp correction does not create a second event.
2. **Timing gate and prices.** A reaction is eligible only when `releaseAt` is
   present, `timingStatus` is `VERIFIED` or `SCHEDULED`, and `timingSource` is
   nonblank. Otherwise Yahoo is not called. For an eligible event, fetch all 12
   symbols in `ASSET_UNIVERSE` around `releaseAt` and resolve four prices:
   - `priceAtEvent` — strictly pre-release baseline: the latest usable
     intraday open within two hours, else the preceding session's close whose
     provider bar is within four calendar days
   - `price_1h` — first usable intraday open at/after `releaseAt + 1h`, within
     the bounded provider-gap tolerance
   - `price_1d` — first usable daily open after the release session
   - `price_1w` — first usable daily open at least seven calendar days after
     the release session
   - Compute `pct_change_*` from that baseline, persist the provider bar as
     `anchorAt`, and stamp the current `calculationVersion` (2 today).

   The endpoints are release-relative, not baseline-relative, so pre-market and
   weekend gaps are included. For a prior-session daily-close fallback, Yahoo
   timestamps the bar at its open; `anchorAt` is therefore a source-bar
   identifier, not an exact close timestamp.
3. **Macro.** If the event type is CPI/PPI/NFP/FED_DECISION, fetch the actual
   and prior values from FRED in the canonical unit. Persist the actual source
   and URL. If the seed includes an `expectedValue`, compute the arithmetic
   surprise, but mark it `UNVERIFIED` unless source, HTTPS source URL and as-of
   metadata are supplied and validated against a trusted `releaseAt`. If no
   expectation exists, consensus status is `MISSING`. Either side alone can
   produce a `DataRelease` row.
4. **Persist** as a single Prisma transaction:
   - 1 `Event` row with stable identity and timing provenance
   - 0–12 `AssetReaction` rows (skipped per-asset only when Yahoo fails to
     produce an anchor; all 12 are suppressed when timing is ineligible)
   - 0–1 `DataRelease` row with metric/reference/provenance fields

For a curated monthly release, `fetch-macro.ts` selects an explicitly supplied
`referencePeriodStart` or the latest observation before the release month. It
requests the FRED/ALFRED vintage as of the seed event date and warns before
falling back to the current revised series. For a curated Fed decision it reads
the target upper bound in force on the supplied day and scans forward for the
effective change; target-rate values are not revision-sensitive. The database
does not yet persist which vintage/fallback path was used.

### Best-effort failure model

- A symbol that errors → null fields + warning + continue. Missing prices can
  be filled in later with `npm run backfill:prices` (see `scripts/backfill/`).
- A symbol with no anchor price at all → row skipped, warning, continue.
- Ineligible timing → all reactions intentionally suppressed, event/release
  metadata still written.
- FRED 4xx/5xx → log + continue without macro.
- DB transaction failure → log, mark event as failed, continue to next event.
- Pipeline only halts on totally unrecoverable errors (neither database URL is
  set, an unparseable timestamp appears on a seed row, etc.).

Re-run as needed — events that succeeded won't be re-fetched.

---

## Files

| File                    | Job                                                            |
| ----------------------- | -------------------------------------------------------------- |
| `events-seed.ts`        | The 50 hand-curated seed events + `ASSET_UNIVERSE`             |
| `fetch-prices.ts`       | Yahoo Finance calculation-v2 resolver: bounded pre-release baseline + release-relative endpoints |
| `fetch-macro.ts`        | FRED series fetcher (actual + prior)                           |
| `compute-reactions.ts`  | `% change` math + surprise magnitude                           |
| `src/services/macro/metrics.ts` | **Canonical metric registry** — series → transform → unit. Shared by the curated path, the bulk path *and the web app*, which needs the unit to render a stored number |
| `src/services/macro/time.ts`    | Strict date parsing and US-Eastern wall clock → UTC conversion. It handles DST when a source establishes a time; it does not establish that 08:30/14:00 was the release time |
| `src/services/macro/consensus.ts` | Provider interface and validator for future sourced consensus integrations |
| `src/services/macro/release-calendar.ts` | Provider interface and validator for official historical release timing; no adapter/fallback clock yet |
| `src/services/events/timing.ts` | Reaction eligibility and current calculation version |
| `types.ts`              | Shared types between modules                                   |
| `ingest.ts`             | CLI orchestrator                                               |

## Schema

See `prisma/schema.prisma`:

- `Event` — stable nullable `eventKey`; required compatibility/display
  `occurredAt`; exact `releaseAt`; date-only `releaseDate`; `timingStatus` and
  `timingSource`; headline/type/source/explanation. `eventKey` is unique and
  `(headline, occurredAt)` remains a legacy uniqueness backstop.
- `AssetReaction` — FK to `Event`, symbol, pre-release baseline + three endpoint
  prices and percent changes, provider-bar `anchorAt`, and
  `calculationVersion`. Unique on `(eventId, assetSymbol)`.
- `DataRelease` — FK to `Event`; `metricKey`/`metricName`;
  `referencePeriodStart`; expected/actual/prior/surprise; actual source/URL; and
  consensus status/source/URL/as-of. Unique on `(eventId, metricName)`.

## Adding more events

Edit `events-seed.ts` and re-run `npm run ingest`. New entries are appended;
existing ones are no-ops thanks to the idempotency check.

Do not promote a conventional or plausible timestamp. To enable reactions,
independently verify the exact market-facing instant, set `releaseAt`, set
`timingStatus` to `VERIFIED` or `SCHEDULED`, and record a nonblank authoritative
`timingSource`. `occurredAt`, `releaseDate` and `referencePeriodStart` are not
substitutes for that instant.

For a surprise calculation, fill in `expectedValue` (FRED only ships actuals).
An uncited value remains `UNVERIFIED`; also supply `consensusSource`, an
authoritative `consensusSourceUrl`, and `consensusAsOf` before treating it as
verified. Normally leave `metricName` unset so the canonical registry controls
metric identity and units.

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
| FRED   | 11 series: CPI, Core CPI, PPI, NFP, UNRATE, FEDFUNDS, PCE, Core PCE, GDP, UMich Sentiment, JOLTS. The observation date is a reference period, so `releaseAt`/`releaseDate` stay null, status is `REFERENCE_PERIOD_ONLY`, consensus is `MISSING`, and reactions are suppressed. Values are current-vintage. |
| BLS    | 4 series direct from the Bureau of Labor Statistics: CPI-U, Core CPI-U, Total Nonfarm Payroll, Unemployment Rate. The API's year/period is also reference-only, not a publication time; it uses the same fail-closed timing and consensus policy as FRED. Paginated 10 years per request. |
| FOMC   | Walks daily `DFEDTARU` target-upper-bound changes. The effective date proves neither statement date nor time; the prior-day date/14:00 ET value is `INFERRED` display metadata (including `releaseDate`), `releaseAt` stays null, and reactions are suppressed. **Hold meetings are not captured.** |

### Run

```bash
# Current recommended mode: event/release metadata only — ~15 minutes.
# No current bulk source has reaction-eligible timing.
npm run auto-ingest -- --no-prices

# Recommended first run on a fresh DB:
npm run auto-ingest:dry-run -- --no-prices      # validates plumbing
npm run auto-ingest -- --no-prices               # load event metadata fast
# Later: resolve authoritative timing, then use backfill:prices.
```

All flags:

```
--source <fred|bls|fomc>    Restrict to one source (default: all).
--dry-run                   Fetch + count, write nothing.
--since <YYYY-MM-DD>        Earliest source reference/display date (default 2000-01-01).
--no-prices                 Skip Yahoo fetching. Recommended for current bulk sources.
-h, --help                  Show help.
```

### Dedup

Primary identity is the source-independent `eventKey`. Initial macro releases
use `macro:<metric-key>:initial:<reference-period>`, so FRED and BLS candidates
for the same canonical metric and period deliberately collide even though the
provider differs. A `DFEDTARU` change key uses its proven effective date; it does
not depend on the inferred announcement time.

For rows created before `eventKey` existed, the orchestrator retains a fallback:
same `event_type`, same UTC day and same canonical `metric_name`. All three parts
matter: matching on `(event_type, day)` alone would collapse headline CPI with
Core CPI, PCE and Core PCE, and payrolls with unemployment. Together these
checks:

- Prevents double-inserts on re-runs of auto-ingest itself
- Avoids creating mechanical duplicates of the 50 curated seed events
- Catches FRED ↔ BLS overlap (both ship CPI / unemployment)

Candidates accepted earlier in the same run are tracked by `eventKey` in memory,
so a FRED and a BLS print of the same month collide in a dry-run exactly as they
would in a real run where the first had already been committed.

If a collision still slips past, the Postgres `(headline, occurred_at)` unique
constraint catches it and the event is logged as skipped.

### What the spec says vs what got built

The original spec asked for FRED `release_id=82` for FOMC meeting dates.
That endpoint actually returns the H.15 release publication schedule —
**3 dates total** since 2023, not the 24 meetings we need. The
implementation switched to walking the `DFEDTARU` daily series and emitting
events on every step change. Side effect: **hold meetings are excluded**
(they produce no rate change). Each event has a defensible pre/post target rate
and effective date, not a proven meeting/statement date. The code subtracts one
calendar day and renders 14:00 ET only as an `INFERRED` compatibility value;
`releaseAt` remains null until an official calendar/statement source resolves
it.

The spec also wrote `event_type: "cpi"` lowercase; the schema uses uppercase
`EventType` enum values (`"CPI"`, `"FED_DECISION"`, etc.). The code maps
to the schema values.

The spec named JOLTS as series ID `JOLTS`; the actual FRED ID is `JTSJOL`.
Used the real one.

### Backfilling prices later

A re-run with `--no-prices` followed by a re-run without it does **not** add
prices to already-inserted events — dedup skips them entirely. Use the dedicated
backfill script after authoritative timing has been stored:

```bash
npm run backfill:prices:dry-run -- --only-empty --limit 5   # inspect
npm run backfill:prices -- --only-empty                    # apply
```

It walks events missing `AssetReaction` rows oldest-first, commits each event on
its own (so Ctrl-C leaves a consistent database and a re-run continues), and is
additive — it never updates or deletes an existing reaction row. Its query and
writer are fail-closed: the query narrows to `VERIFIED`/`SCHEDULED` events with
non-null timing fields, and the writer rechecks full eligibility, including a
nonblank `timingSource`, before any provider call. Current reference-only and
inferred bulk rows are ignored.

### Repairing legacy reactions

Rows written before the timing policy and calculation version existed are
already hidden by the application read path. Clean persisted state with the
dry-run-first repair:

```bash
npm run repair:reaction-timing:dry-run
```

Both report and apply modes require `DIRECT_URL` (no pooled/fallback URL).
Apply additionally requires `--apply`, an explicit `--all` or repeated
`--event-id` scope, and a literal confirmation. It
deletes only reactions on timing-ineligible events or rows
whose `calculationVersion` is not current; it never changes an `Event` or
`DataRelease`:

```bash
REACTION_REPAIR_CONFIRM=DELETE_UNTRUSTED_OR_LEGACY_REACTIONS \
  npm run repair:reaction-timing -- --apply --all

# Or scope the apply with one or more --event-id values instead of --all.
```

Trusted legacy events can then be recomputed with the event-scoped command the
repair prints, `npm run backfill:prices -- --event-id <uuid>`. Untrusted events
remain reaction-free until their release timing is sourced. The repair and
backfill are both idempotent.

### Expected scale

For `--since 2000-01-01`:

| Source | Events (approx)                              |
| ------ | -------------------------------------------- |
| FRED   | ~1,600 — 11 series, mostly monthly, 25 years |
| BLS    | ~1,000 — 4 series, monthly, deduped vs FRED  |
| FOMC   | ~150 — rate decisions only                   |
| **Total after dedup** | ~2,000–2,500                   |

For `--since 2024-01-01` (verified): ~308 candidates per dry-run.
