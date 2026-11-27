# Candle preservation pipeline

Durable archive of OHLCV bars around timing-eligible macro events, so rolling
provider lookbacks cannot erase history the product still needs.

**Bulk live downloads are gated.** Yahoo commercial / automated-collection /
redistribution terms remain **unverified**. Planning and local inventory work
without confirmation; calling the live provider in bulk, or writing fetched
bars, requires an explicit env confirmation after terms are reviewed.

## Measured semantics (do not invent new ones)

### Session classification

- Bars are stamped at their **open** instant (UTC).
- Session is classified in `America/New_York` against 09:30–16:00 regular hours
  (`classifySession` in `scripts/ingest/candle-semantics.ts`).
- Extended-hours Yahoo volume of `0` is **not** a measurement — it is stored as
  `NULL` via `normalizeProviderVolume`. Regular-session zero volume is kept.

### Price basis

| Interval | Declared `PriceBasis` |
| --- | --- |
| Intraday (`1m`–`1h`) | `AS_TRADED` |
| Daily (`1d`) | `SPLIT_ADJUSTED` |

The Yahoo adapter **refuses** a fetch when intraday and daily series disagree
on scale (`basis_rejected`). It does not rescale, invent a split factor, or
repair the series.

### Lookbacks / rolling window loss

| Interval | Measured lookback |
| --- | --- |
| `1m` | 30 days |
| `5m` / `15m` / `30m` | 60 days |
| `1h` | 730 days |
| `1d` | full history (`null` cliff) |

These windows **roll**. An event reachable today can become permanently
unreachable. Preservation therefore ranks **oldest-at-risk first**.

## Permissions status

| Status | How | Allowed |
| --- | --- | --- |
| `unverified` (default) | env unset / wrong value | Local inventory, plan dry-run, coverage estimates |
| `confirmed` | `CANDLE_SOURCE_PERMISSIONS_CONFIRMED=yahoo-finance2-terms-verified` | Above + live bulk fetch + apply writes (apply still needs write confirm) |

Module: `scripts/ingest/candle-source-permissions.ts`.

**Do not** commit a confirmed value in config. Confirmation is a human/legal
step, not a code change.

## How the CLIs interact

```text
inventory:candles   →  read Postgres only (day-level coverage)
backfill:candles    →  plan (default) → optional --execute → optional --apply
probe:candles       →  provider reachability probe (separate audit tool)
verify:candles      →  stored invariant checks
```

### Plan (default)

```bash
npm run backfill:candles
npm run backfill:candles -- --symbol SPY --limit 5
```

- Loads timing-eligible events from Postgres (readonly client).
- Builds work units `(eventId, symbol, interval, from, to)`.
- Skips a unit only when every **expected regular-session openTime** for the
  ±2 calendar-day release window is already stored. The observed SPY daily
  calendar is checked for completeness against an independent curated NYSE
  holiday schedule before any skip; a missing trading day fails closed
  (never shrinks the grid). Weekends/full closes contribute no stamps; early
  closes shorten that day's grid. Equal bar counts with missing critical
  timestamps do **not** skip.
- Prints days-remaining / at-risk flags and upper-bound row estimates.
- **No provider calls. No writes.**

### Execute (live dry-run fetch)

```bash
CANDLE_SOURCE_PERMISSIONS_CONFIRMED=yahoo-finance2-terms-verified \
  npm run backfill:candles -- --execute
```

- Requires permissions confirmation.
- Fetches remaining units with per-request / per-event delays.
- Retries **only** transient `provider_error` (bounded backoff).
- Does **not** retry `unreachable`, `basis_rejected`, or `empty`.
- Counts would-insert vs already-present; writes nothing.

### Apply

```bash
CANDLE_SOURCE_PERMISSIONS_CONFIRMED=yahoo-finance2-terms-verified \
  CANDLE_BACKFILL_CONFIRM=WRITE_CANDLES \
  npm run backfill:candles -- --apply
```

- Requires **both** permissions confirmation and `CANDLE_BACKFILL_CONFIRM`.
- `createMany({ skipDuplicates: true })` per event·symbol — additive only,
  never updates/deletes existing `Candle` rows.
- Ctrl-C safe: re-run resumes; duplicates are skipped.

### Inventory

```bash
npm run inventory:candles
npm run inventory:candles -- --symbol SPY --interval 1h
```

Read-only day-granularity report for `CURRENT_CANDLE_INGESTION_VERSION` rows.

## Explicit non-goals (this pipeline)

- No Prisma schema changes.
- No Polygon integration.
- No bulk Yahoo download in CI or default scripts.
- No flipping permissions to `confirmed` in committed config.
