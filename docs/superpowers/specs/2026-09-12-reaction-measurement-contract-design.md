# Reaction measurement contract — design

**Status:** design approved in principle; spec pending review
**Date:** 2026-09-12
**Addresses:** audit finding F1 / roadmap item P0.1
**Calculation version introduced:** 3

---

## 1. The defect

Every published reaction in the product today is produced by
`resolvePriceSnapshot` (`scripts/ingest/fetch-prices.ts`) under calculation
version 2, which resolves a baseline by *instant* proximity and endpoints by
*session* position. Those two coordinate systems do not compose into a fixed
exposure, so values stored in one column describe different intervals.

### 1.1 Measured evidence

Classification of all 240 live v2 reactions (`calculation_version = 2` on
timing-eligible events) by anchor lag:

| Anchor mode | n | Lag before release | Has 1H reading | Mean \|1D\| | Median 1D |
| --- | --- | --- | --- | --- | --- |
| Intraday bar | 110 | 0.5 – 1.0 h | 110 / 110 | 1.10 % | +0.144 % |
| Prior session close | 130 | 23.0 – 47.0 h | 0 / 130 | 2.09 % | −0.459 % |

Three facts follow:

1. **The population is perfectly bimodal.** No observation falls between 1.0 h
   and 23.0 h. These are two measurement methodologies, not a continuum.
2. **Mode is perfectly predicted by intraday availability**, which is a function
   of event age against the provider's 730-day rolling window. Methodology is
   therefore confounded with event age.
3. **The longer window mechanically produces ~2× the mean absolute move.**

The pooled aggregates on `/patterns` are artifacts of the mix. `QQQ` /
`INFLATION` reads **+1.37 %** pooled, decomposing into **+1.94 %** (intraday,
n=5) and **−0.16 %** (prior close, n=4) — a 2.09 pp gap and a sign inversion.

### 1.2 The defect is also intra-event

11 of the 20 priced events contain instruments in *both* modes. On
`June 2025 NFP` (release `2025-07-03T12:30:00Z`), `XLK` and `XLE` anchor at
`2025-07-02 13:30` (23 h back, because the split-basis guard discards their
intraday series) while the other ten instruments anchor at `2025-07-03 12:00`
(30 min back). The event page's "which instruments reacted most", its
direction-breadth count and its "largest measured move" verdict therefore rank
one-session moves against two-session moves inside a single ranked list.

### 1.3 Why `baselineMode` alone is insufficient

Recording which mode produced a value would document the defect without
removing it. Heterogeneity also exists *within* the intraday mode: an 08:30
pre-market release receives a full 6.5 h session inside its "1D", while a 14:00
FOMC release receives 2 h. Stratifying by anchor mode does not separate those.

---

## 2. Design principle

> **A measurement's anchor is determined by the measure, never by data
> availability. Availability decides whether a value exists, never what it
> means.**

This is the property that makes grouped values comparable, and it is what
distinguishes this design from stratification.

It follows the precedent already set by `Candle.priceBasis`, which is part of
that model's natural key because "the same minute quoted as-traded and
split-adjusted is two different facts". The same reasoning applies to a
reaction measured under two different window definitions.

---

## 3. The four measures

Two families with different provenance shapes, deliberately not unified.

| Enum | UI label | Anchor | Endpoint | Requires | Exposure |
| --- | --- | --- | --- | --- | --- |
| `INTRADAY_60M` | First hour | last intraday bar opening strictly before `releaseAt`, ≤ 2 h old | first intraday bar opening at or after `releaseAt + 60 min`, ≤ 2 h slip | intraday bars | 60 min of clock time when the series is complete; see §3.2 |
| `RELEASE_SESSION` | Release session | close of the session preceding the release session | close of the release session | daily bars | exactly 1 canonical session |
| `SESSION_PLUS_1` | Next session | close of the session preceding the release session | close of release session + 1 | daily bars | exactly 2 canonical sessions |
| `SESSION_PLUS_5` | 5 sessions | close of the session preceding the release session | close of release session + 5 | daily bars | exactly 6 canonical sessions |

`RELEASE_SESSION` is the **headline measure**: it has the broadest historical
coverage (daily bars extend decades, intraday does not) and a standardized
one-session exposure.

### 3.1 What `RELEASE_SESSION` does and does not claim

`RELEASE_SESSION` measures the **session containing the release**, from the
prior session's close to that session's close. For a release that lands during
the session — a 14:00 FOMC decision, for example — **the window intentionally
includes that session's pre-release trading.** Total exposure is uniform (one
session for every observation), but the proportion of the window that follows
the release varies with the release time.

This is the standard event-study `[0]` day window and it is uniform, which is
what an aggregate requires. It is **not** a claim of temporal tightness.
`INTRADAY_60M` is the temporally tighter measure where it is available;
`RELEASE_SESSION` is the broader standardized measure that is available
everywhere. Both statements appear in the UI methodology copy.

**The post-release fraction also varies across instruments for the same event**,
because native closes differ (§4.3). A 14:00 ET FOMC release leaves 2 h of
post-release trading inside `SPY`'s session window, 3 h inside `CL=F`'s and 5 h
inside `BTC-USD`'s. Total exposure is uniform at one canonical session for all
three; the post-release share is not. This is disclosed, not corrected — it
cannot be corrected with daily bars.

### 3.2 `INTRADAY_60M` exposure is 60 minutes, with a bounded and recorded exception

With a complete hourly series the endpoint is exactly `releaseAt + 60 min`
quantised to the next bar, which for an 08:30 or 14:00 ET release is exactly 60
minutes. The ≤ 2 h slip inherited from v2 exists only to tolerate a single
missing provider bar, and when it is used the elapsed interval is longer.

Because `endpointBarAt` is stored, the true elapsed interval of every
`INTRADAY_60M` row is auditable and filterable after the fact. The verification
script reports the distribution of actual elapsed minutes so that a series with
many slipped endpoints is visible rather than assumed away. The measure is
described in the UI as "60 minutes after the release" with the slip stated in
the methodology copy.

### 3.3 Rejected alternatives

- **Strict elapsed-time windows** (`release + 1 h / 24 h / 168 h`). Statistically
  ideal, but `npm run probe:candles` reports 0/20 events reachable at 1m/5m/15m
  and 10/20 at 1h. It would null out essentially every 1D and 1W the product has.
- **Stratify the existing math.** See §1.3.
- **Session opens as endpoints** (the v2 convention). Opening auctions are noisier
  than closing auctions and the open/close asymmetry in v2 (`close` anchor,
  `open` endpoint) is itself a source of non-comparability. v3 is close-to-close
  throughout the session family.

---

## 4. Session and calendar policy

### 4.1 The canonical calendar

**One canonical calendar governs session identity for every instrument: the US
equity regular-hours calendar.**

- **Calendar authority — trading days.** The set of dates on which the canonical
  reference instrument (`SPY`) has a provider daily bar. This is self-consistent
  with the price data, requires no external calendar dataset, and cannot drift
  from the series the measurements are taken over. Holidays are therefore
  handled implicitly and exactly: a date with no `SPY` bar is not a session.
  The reference series is fetched **once per event** and reused for every
  instrument, so all twelve instruments are assigned sessions by the same
  calendar. If the reference series is unavailable for an event, **no session
  measurements are written for that event at all** — falling back to a
  per-instrument calendar would silently change what `RELEASE_SESSION` means.
- **Calendar authority — close times.** 16:00 `America/New_York`, resolved
  through the existing DST-correct `easternWallClock(isoDay, 16, 0)` in
  `src/services/macro/time.ts`. Early closes are handled by an explicit table
  (§4.4).
- **Timezone.** All session boundaries are computed in `America/New_York` and
  stored as UTC instants or as SQL `DATE` session days. No fixed UTC offset is
  ever hardcoded.

Rationale for a single canonical calendar: the events are US macro releases, so
"the session the print landed in" is a US-market concept; and using one calendar
for date selection gives **uniform calendar-time spans across instruments**,
which is the property cross-asset comparison actually needs.

### 4.2 Session resolution rules

> **Release session** = the first canonical session whose **close** is strictly
> after `releaseAt`.
>
> **Anchor session** = the canonical session immediately preceding the release
> session.

| Release | Release session | Anchor session |
| --- | --- | --- |
| 08:30 ET Wed (pre-market) | Wed | Tue |
| 14:00 ET Wed (intra-session) | Wed | Tue |
| 16:20 ET Wed (after close) | Thu | Wed |
| 16:00:00.001 ET Wed | Thu | Wed |
| 16:00:00.000 ET Wed (exactly at close) | Thu | Wed — **rejected**, see §4.5 |
| Sat 00:01 ET | Mon | Fri |
| Mon is a holiday, release Mon 08:30 ET | Tue | Fri |

`SESSION_PLUS_n` endpoints are the canonical session `n` positions after the
release session, counted in trading sessions, skipping non-session dates.

### 4.3 Heterogeneous instruments

The universe spans three session structures. Date selection is canonical for all
of them; **price selection is native** — each instrument's own provider daily bar
for the canonical dates. Each measurement row records the instrument's session
structure so the difference is represented rather than hidden behind one enum.

| `sessionBasis` | Instruments | Native session | Native close (ET) |
| --- | --- | --- | --- |
| `US_EQUITY_RTH` | SPY QQQ IWM TLT GLD XLK XLF XLE | 09:30–16:00 ET | 16:00 |
| `EXTENDED_FUTURES` | CL=F GC=F DX-Y.NYB | ~23 h CME/ICE trading day | 17:00 |
| `CONTINUOUS_24_7` | BTC-USD | 00:00–24:00 UTC | 19:00 EST / 20:00 EDT |

The native close times above are **declared approximations used for exactly one
purpose: the anchor-validity guard of §4.5.** They are not settlement times, are
never used to timestamp a price, and are never rendered as precision. No stored
value claims to have been observed at them.

A symbol with no declared `sessionBasis` produces **no measurements** and a
counted reason. Defaulting an unknown instrument to `US_EQUITY_RTH` would assign
it a session structure nobody verified, which is the class of silent assumption
this contract exists to remove.

**Consequence for cross-asset comparison.** Because canonical *dates* are used
for every instrument, each measurement spans the same calendar time — an
`SPY` `RELEASE_SESSION` covers Tue 16:00 → Wed 16:00 ET and a `BTC-USD`
`RELEASE_SESSION` covers Tue ~19:00 → Wed ~19:00 ET; both are 24 h containing the
release. Over a weekend both stretch to 72 h; across a holiday both stretch to
96 h. Calendar-time exposure is uniform.

What differs is the **tradeable time inside that span**: 6.5 h for an equity ETF,
~23 h for a futures contract, 24 h for crypto. That difference is real, is not
removable with daily bars, and is therefore recorded in `sessionBasis` and
disclosed in the UI wherever instruments are compared directly.

**Pooling rule.** No aggregate may combine observations across `sessionBasis`.
This is structurally satisfied for every aggregate in the product today, because
all of them group by symbol (`analyzeCategory`, `profileObservations`,
`distributionFor`, `summarizeDistribution`) and a symbol has exactly one
`sessionBasis`. The three places that *do* compare instruments directly —
biggest-move ranking, the event verdict (largest move, direction breadth) and
the cross-asset bars — must disclose `sessionBasis` rather than suppress it.

### 4.4 Early closes

A cited table of US equity early-close dates (13:00 ET) is **isolated inside the
canonical session/calendar module** and exported only through the calendar API,
so no caller can consult a raw date list or bypass the range check.

- **Provenance.** NYSE holiday and hours calendar, cited by URL in the module,
  with the retrieval date recorded beside the table.
- **Supported range.** Declared explicitly as a constant pair of dates covering
  2022-01-01 – 2026-12-31 (the library's span plus headroom). The range is part
  of the module's public API so callers can test membership.

**Ambiguity window.** An early close can only change release-session assignment
for a release timestamped in `[13:00, 16:00)` ET. Before 13:00 neither close has
passed; at or after 16:00 both have. Outside that window the early-close status
of a date cannot affect the result.

**Fail-closed rule.** If `releaseAt` falls in the ambiguity window on a date
**outside the supported range**, no session measurements are produced for that
event, and the reason is counted and reported. A normal 16:00 close is **never**
assumed when that assumption could change session assignment. Outside the
ambiguity window the supported range is irrelevant and measurement proceeds
normally, because the answer is the same either way.

The same table supplies the `US_EQUITY_RTH` native close used by the §4.5 anchor
guard: 13:00 ET on a listed early-close date, otherwise 16:00 ET.

The verification script reports every event that fell in the ambiguity window,
whether it was resolved from the table or refused for being out of range, so an
un-extended table surfaces as a coverage number rather than as silence.

No FOMC meeting or BLS release currently in the library falls in the ambiguity
window.

### 4.5 Anchor validity guard

A session measurement requires the anchor session's **native close instant for
that instrument** to be strictly before `releaseAt`. Otherwise no rows are
written for that instrument for that event.

This guard is necessary because for an **after-hours release** the anchor session
is the release's own calendar day, and an instrument whose native close is later
than 16:00 ET would otherwise contribute a post-release anchor. A 17:00 ET
release on Wednesday resolves to release session Thursday and anchor session
Wednesday; `SPY` closed at 16:00 (valid) but `BTC-USD` does not close until
~19:00 (invalid — rejected).

The same guard resolves the **release-exactly-at-close** case without a special
rule: at exactly 16:00:00.000 the anchor close is not *strictly* before
`releaseAt`, so session measures are not produced. `INTRADAY_60M` is unaffected
and may still be produced.

Fail-closed is consistent with the project's existing timing philosophy: a
measurement that cannot be defended is absent, never approximated.

---

## 5. Schema

Additive only. `asset_reactions` is **not** modified, widened, updated or
deleted. Legacy v1 and v2 rows remain exactly as they are.

```prisma
/// Which standardized interval a reaction measurement describes.
enum ReactionMeasure {
  INTRADAY_60M
  RELEASE_SESSION
  SESSION_PLUS_1
  SESSION_PLUS_5
}

/// Which kind of observation the measurement is anchored on. Determined by the
/// measure, never by what data happened to be available.
enum ReactionAnchorKind {
  PRE_RELEASE_INTRADAY_BAR
  PRIOR_SESSION_CLOSE
}

/// The instrument's own session structure. Recorded so that a cross-asset
/// comparison can disclose it instead of implying every SESSION_* value covers
/// the same amount of tradeable time.
enum SessionBasis {
  US_EQUITY_RTH
  EXTENDED_FUTURES
  CONTINUOUS_24_7
}

/// One standardized, fully specified reaction measurement.
///
/// A row exists only when the measurement was actually made. There is no
/// nullable price, no nullable percent and no placeholder row: an unmeasurable
/// window produces no row at all, which makes a fabricated zero
/// unrepresentable rather than merely discouraged.
model ReactionMeasurement {
  id      String          @id @default(uuid())
  eventId String          @map("event_id")
  event   Event           @relation(fields: [eventId], references: [id], onDelete: Cascade)
  symbol  String
  measure ReactionMeasure

  anchorKind   ReactionAnchorKind @map("anchor_kind")
  anchorPrice  Float              @map("anchor_price")
  /// Provider bar identifier for the anchor observation. For a session close
  /// this is the provider's daily-bar stamp (normally the session open), not a
  /// closing-tick instant — it identifies the source bar.
  anchorBarAt  DateTime           @map("anchor_bar_at") @db.Timestamptz(3)
  /// Canonical session the anchor observation belongs to.
  anchorSessionDay DateTime       @map("anchor_session_day") @db.Date

  endpointPrice    Float    @map("endpoint_price")
  endpointBarAt    DateTime @map("endpoint_bar_at") @db.Timestamptz(3)
  endpointSessionDay DateTime @map("endpoint_session_day") @db.Date

  /// Canonical session containing the release; origin of every SESSION_* offset.
  releaseSessionDay DateTime @map("release_session_day") @db.Date

  /// ((endpointPrice - anchorPrice) / anchorPrice) * 100.
  pctChange Float @map("pct_change")

  /// Basis of BOTH observations. A measurement is written only when the anchor
  /// and endpoint bars are on the same basis, so one column describes the pair.
  priceBasis   PriceBasis   @map("price_basis")
  sessionBasis SessionBasis @map("session_basis")

  provider           String
  calculationVersion Int      @map("calculation_version")
  fetchedAt          DateTime @map("fetched_at") @db.Timestamptz(3)
  createdAt          DateTime @default(now()) @map("created_at")

  @@unique([eventId, symbol, measure, calculationVersion], name: "reaction_measurement_key")
  @@index([eventId, calculationVersion])
  @@index([symbol, measure, calculationVersion])
  @@index([measure, calculationVersion])
  @@map("reaction_measurements")
}
```

`Event` gains `reactionMeasurements ReactionMeasurement[]`. No other model
changes.

`CURRENT_REACTION_CALCULATION_VERSION` becomes **3**. Its existing meaning is
preserved: read paths discard rows whose version is not current.

### 5.1 Bumping the shared constant has a destructive side effect that must be contained

`src/services/events/reactionRepair.ts` computes deletion candidates as
`reactions.filter(row => row.calculationVersion !== CURRENT_REACTION_CALCULATION_VERSION)`
over `asset_reactions`. Raising the constant to 3 would therefore make
`planReactionRepair` classify **all 240 surviving v2 rows as
`legacy_calculation`**, and `npm run repair:reaction-timing` would report them as
rows to delete — the exact production data this design exists to preserve.

The script is dry-run by default and requires
`REACTION_REPAIR_CONFIRM=DELETE_UNTRUSTED_OR_LEGACY_REACTIONS` to apply, so
nothing happens automatically. It is still an unacceptable trap.

**Containment.** `asset_reactions` becomes a frozen archive:

- A new constant `ARCHIVED_ASSET_REACTION_VERSION = 2` is introduced, and
  `reactionRepair.ts` / `repair-reaction-timing.ts` are rebound to it. They no
  longer reference `CURRENT_REACTION_CALCULATION_VERSION`.
- `CURRENT_REACTION_CALCULATION_VERSION` refers solely to
  `reaction_measurements` from v3 onward.
- The repair script's "recompute with `backfill:prices`" guidance is redirected
  to `backfill:reaction-measurements`.
- A regression test asserts that a v2 row on a timing-eligible event is **not** a
  deletion candidate.

This decoupling is part of stage 1 and must land in the same commit as the
constant bump.

### 5.2 Why a separate table rather than widening `asset_reactions`

- The measure family needs **two different anchors**; the wide table assumes one.
- Endpoint timestamps are needed per measure; on the wide table that is ~16
  columns and re-bakes the rigidity `docs/architecture.md` already records as
  debt ("reaction windows are columns, not rows").
- A new table means the migration is **pure DDL** — `CREATE TYPE` ×3,
  `CREATE TABLE`, indexes — with **zero writes to existing production rows**, and
  rollback is `DROP TABLE`.
- Future measures (30 m, `SESSION_PLUS_20`) need no migration.

---

## 6. Invariants

### 6.1 Universal — hold for every row, enforced by the verification script

| Invariant | Rationale |
| --- | --- |
| `anchorPrice > 0` and finite; `endpointPrice > 0` and finite | a non-positive price is a provider fault, not an observation |
| `pctChange == (endpointPrice − anchorPrice) / anchorPrice × 100` within float tolerance | the stored percent cannot drift from the stored prices |
| `anchorBarAt < endpointBarAt` | the anchor bar always precedes the endpoint bar |
| `anchorSessionDay ≤ releaseSessionDay` | the anchor is never taken from a session after the release session |
| `endpointSessionDay ≥ releaseSessionDay` | the endpoint is never before the release session |
| `anchorSessionDay`, `releaseSessionDay`, `endpointSessionDay` are canonical sessions | no measurement references a non-trading date |
| one `anchorKind` per `measure` across the whole table | proves availability never changed an anchor |
| one `sessionBasis` per `symbol` across the whole table | proves an instrument's session structure is stable |

### 6.2 The proposed universal invariant `anchorAt < releaseAt < endpointAt` is INVALID

It must not be encoded. It fails for the session family in two distinct ways:

1. **`releaseAt < endpointBarAt` is false for `RELEASE_SESSION`** whenever the
   release is at or after the session open. Yahoo stamps daily bars at the
   session *open*, so for a 14:00 ET release the release-session bar is stamped
   ~09:30 ET — before the release — even though the endpoint *price* is that
   session's close.
2. **`anchorBarAt < releaseAt` is trivially true but not the meaningful check**
   for the session family. The claim that matters is that the anchor session's
   *close* precedes the release, which is a session-ordering fact, not a
   bar-stamp fact.

Rather than weakening the check, the verification script branches on measure
family:

| Family | Instant invariants | Session invariants |
| --- | --- | --- |
| `INTRADAY_60M` | `anchorBarAt < releaseAt`; `releaseAt + 60 min ≤ endpointBarAt ≤ releaseAt + 60 min + slip` | `anchorSessionDay ≤ releaseSessionDay` |
| `RELEASE_SESSION` / `SESSION_PLUS_n` | native close of `anchorSessionDay` for this `sessionBasis` `< releaseAt` (§4.5) | `anchorSessionDay` is the canonical session immediately preceding `releaseSessionDay`; `endpointSessionDay` is exactly `n` canonical sessions after `releaseSessionDay` |

This is the point the reviewer raised: a measure with different semantics is
represented explicitly rather than accommodated by loosening a shared rule.

### 6.3 The canonical calendar is part of the calculation version

A stored `releaseSessionDay` is only meaningful relative to the calendar that
produced it. Extending the early-close table (§4.4), changing a declared native
close (§4.3) or changing the reference instrument would alter what an already
stored value means, while leaving the value itself untouched and unverifiable.

**Rule: any change to the canonical calendar, the early-close table or the
declared native closes requires a calculation-version bump.** Adding a *future*
date to the early-close table before any event uses it is the one exemption,
because it cannot change an existing row. The verification script records the
distinct `releaseSessionDay` set per version so a calendar change that failed to
bump the version is detectable after the fact.

---

## 7. Preventing accidental pooling

1. **Type level.** `ReactionWindow` is replaced by `ReactionMeasure`. Observations
   are carried as `Record<ReactionMeasure, number | null>` keyed by measure, so
   combining two measures requires explicitly written code rather than a missing
   filter.
2. **Runtime.** The aggregator continues to compute every measure in one pass,
   but into **separate per-measure buckets that are never merged** — it does not
   take a single-measure input. The guard belongs one level down: `statsFor`
   takes its `ReactionMeasure` as its first argument, returns `MeasureStats`
   tagged with it, and throws if handed values drawn from more than one bucket.
   A summary statistic is therefore never produced without naming the measure it
   describes.
3. **Instrument level.** Aggregates group by symbol, and a symbol has one
   `sessionBasis`, so `sessionBasis` pooling cannot occur in an aggregate. The
   three cross-instrument comparison surfaces disclose it.
4. **Sample honesty.** `MIN_AGGREGATE_SAMPLE` and `MIN_DISTRIBUTION_SAMPLE` are
   unchanged and apply per measure. Below threshold, the existing
   `InsufficientData` / `DataStatePanel` states render instead of a figure. No
   aggregate is manufactured by borrowing another measure's observations.

---

## 8. Deployment sequence

The read-path cutover must not precede the backfill, or every event page would
report "not measured yet" for the interval between them. Four ordered stages,
split across commits so the ordering is enforceable at deploy time.

| Stage | Contents | Production effect | Approval |
| --- | --- | --- | --- |
| **1 — additive capability** | migration (DDL only), `ReactionMeasurement` model, `src/services/events/reactionMeasurement.ts` (pure contract + calendar), writer, `backfill:reaction-measurements`, `verify:reaction-measurements`, unit tests. **Read paths untouched.** | none — the app still reads `asset_reactions` v2 and renders exactly as today | safe to merge |
| **2 — dry-run + verification** | `npm run backfill:reaction-measurements:dry-run`, then the verification report over the projected rows | none — reads only | safe to run |
| **3 — production backfill** | `--apply` with env confirmation; writes v3 rows only | inserts into the new table; nothing existing is modified | **requires explicit approval** |
| **4 — read-path cutover** | mapper, queries, aggregation, components, `/api/events`, methodology copy | `/feed`, `/events/[id]`, `/patterns` begin reading v3 | merge only after stage 3 verifies |

**No fallback from v3 to v2 is provided.** A fallback would pool two measurement
contracts, which is the defect being fixed. If stage 4 is deployed before stage
3 completes, pages correctly render the existing "Reaction not measured yet"
state; the sequence exists so that window is never entered.

Rollback: stage 4 reverts to the v2 read path; stage 1 reverts by dropping the
table. Neither loses data.

---

## 9. Backfill and verification

`scripts/backfill/backfill-reaction-measurements.ts`, modelled on the existing
`backfill-candles.ts`:

- **dry-run by default**; `--apply` additionally requires
  `REACTION_MEASUREMENT_BACKFILL_CONFIRM=WRITE_MEASUREMENTS`
- **direct endpoint only** (`DIRECT_URL`), consistent with the other write scripts
- **idempotent** — `createMany({ skipDuplicates: true })` against the natural key
- **resumable** — one transaction per event·symbol, oldest first
- **additive** — never updates or deletes any row in any table
- **fail-closed** — a failed guard produces zero rows and a counted reason
- scoped to timing-eligible events, reusing `reactionTimingEligibility`

`scripts/maintenance/verify-reaction-measurements.ts` reports per-measure and
per-`sessionBasis` coverage, checks every invariant in §6, and exits non-zero on
violation.

### 9.1 Legacy rows cannot be reconstructed

v2 rows store no endpoint timestamps and no daily series, and their endpoints are
session *opens* where v3 uses *closes*. v3 values must therefore be recomputed
from the provider. Daily bars extend decades, so session-family coverage is
expected to **exceed** today's: `INTRADAY_60M` remains limited to the ~10 events
inside the provider's 730-day window, and this is reported rather than hidden.

---

## 10. Test matrix

| # | Case | Asserts |
| --- | --- | --- |
| 1 | 08:30 ET pre-market release | release session = same day; anchor = prior session close |
| 2 | 14:00 ET FOMC intra-session release | release session = same day; window includes pre-release trading |
| 3 | 16:20 ET after-hours release | release session = next day; anchor = that day's close |
| 4 | 16:00:00.001 ET release | release session = next day; anchor valid |
| 5 | 16:00:00.000 ET release exactly at close | session measures rejected; `INTRADAY_60M` unaffected |
| 6 | Saturday release | release session = Monday; anchor = Friday close |
| 7 | Release on a US market holiday | release session = next trading date; holiday is not a session |
| 8 | Holiday between release session and endpoint | `SESSION_PLUS_n` skips it; calendar span stretches |
| 9 | DST spring-forward across the window | session closes resolve via `easternWallClock`, not a fixed offset |
| 10 | DST fall-back across the window | as above |
| 11 | Early close (13:00 ET) with a 14:00 ET release | session assignment uses the early-close table |
| 12 | No intraday data | `INTRADAY_60M` absent; session measures present and unchanged |
| 13 | Stale intraday anchor (> 2 h) | `INTRADAY_60M` absent; no substitution from the session family |
| 14 | Intraday endpoint beyond slip | `INTRADAY_60M` absent |
| 15 | Missing daily bar on a required canonical date | that measure absent; no row |
| 16 | Split-basis mismatch between series | `INTRADAY_60M` absent; session measures unaffected |
| 17 | After-hours release, `CONTINUOUS_24_7` instrument | anchor guard rejects; no session rows for that instrument |
| 18 | After-hours release, `US_EQUITY_RTH` instrument | anchor guard passes |
| 19 | Same event, mixed instrument session bases | each row records its own `sessionBasis`; anchors unchanged |
| 20 | `statsFor` given values from two measures | throws; never silently pooled |
| 21 | Aggregate over symbols with different `sessionBasis` | no aggregate combines them; per-symbol grouping only |
| 21b | Bumping the version does not mark v2 archive rows for deletion | `planReactionRepair` returns no deletion candidates for a v2 row on an eligible event (§5.1) |
| 21c | Reference calendar series unavailable | no session measurements for the event; no per-instrument fallback |
| 21d | Symbol with no declared `sessionBasis` | no measurements, counted reason |
| 22 | Sample below `MIN_AGGREGATE_SAMPLE` | insufficient-data state, no figure |
| 23 | Zero/negative/non-finite provider price | no row |
| 24 | `pctChange` consistency | matches stored prices within tolerance |
| 25 | Anchor/endpoint on different bases | write refused |
| 26 | Invariant branching by family | §6.2 instant rules applied only to `INTRADAY_60M` |

Existing suites must remain green. `tests/fetch-prices.test.ts` continues to
cover v2 unchanged, because v2 remains the read path until stage 4 and the v2
rows remain in the database permanently.

---

## 11. Downstream changes (stage 4)

`mapEvent`, `eventQueries` (`MEASURABLE_1D_REACTION`, `countRankable`,
`idsByBiggestMove`, `getFeaturedEvent`, `getLibraryCoverage`,
`listReactionObservations`), `patternAnalysis`, `reactionView`,
`summarizeReaction`, `EventReactionExplorer`, `HorizonMatrix`,
`ReactionDistribution`, `CrossAssetReactionBars`, `ReactionChart`,
`MiniReactionBars`, `/api/events`, and the event page's Method block.

The headline horizon changes from `1d` to `RELEASE_SESSION`. The Method block is
rewritten to state the contract of §3–§4 and, in passing, corrects the existing
claim that percentages are measured "from the last bar that **closed** before
the release instant" — v2 uses the *open* of the last bar that *opened* before it.

`/api/events` response shape changes (`assets[].measures`). `EventBrowser` is the
only consumer.

---

## 12. Naming

Internal enum values keep event-study precision; UI labels are plain English and
always paired with the interval they mean.

| Enum | UI label | UI sublabel |
| --- | --- | --- |
| `INTRADAY_60M` | First hour | 60 minutes after the release |
| `RELEASE_SESSION` | Release session | Prior close → close of the session containing the release |
| `SESSION_PLUS_1` | Next session | Prior close → close of the following session |
| `SESSION_PLUS_5` | 5 sessions | Prior close → close 5 sessions later |

`SESSION_0` was rejected as an enum name: a reader must know the offset origin to
interpret it. `RELEASE_SESSION` is self-describing.

---

## 13. Out of scope

EDGAR / Federal Register ingestion, consensus providers, Polygon, new
instruments, UI redesign, unrelated technical debt. The 12-instrument universe
and the timing-eligibility gate are unchanged. The split-basis guard changes —
see §15.2.

---

## 15. Contradictions found while planning against the real code — resolved 2026-09-12

Both were flagged rather than silently resolved, and both are now approved.

### 15.1 `getLibrarySummary` was omitted from §11 — APPROVED

An LSP `findReferences` on `CURRENT_REACTION_CALCULATION_VERSION` returns 34
references across 13 files, including **`eventQueries.ts:542`** inside
`getLibrarySummary`, which §11 did not list. It powers the landing page's
`measuredEvents` figure via `LibraryStats` and `LivePreviewPanel`.

**Resolution:** included in the Stage 4 cutover set (implementation plan Task
24). Its `measuredEvents` count must derive from `reaction_measurements` rows at
`measure = 'RELEASE_SESSION'` and the current `calculationVersion` — the same
predicate as every other headline-measure count in the product, so this figure
cannot silently drift from `getLibraryCoverage`'s. No design change; §11 was
simply incomplete.

### 15.2 The cross-series split-basis guard is demoted to a diagnostic — APPROVED, with a stricter invariant

§10 test 16 and §13 (as originally drafted) assumed the v2 basis guard carries
over, suppressing `INTRADAY_60M` when the intraday and daily series disagree.
Tracing `scripts/ingest/candle-provider.ts` shows `YAHOO_BASIS` declares
intraday as `AS_TRADED` and daily as `SPLIT_ADJUSTED` — the two series are
*always* on different bases, by provider design, for every instrument.

Under v2 the guard was **necessary**, because a single reaction mixed an
intraday anchor with daily endpoints — the XLK/XLE 2:1 split produced a
fabricated −50 %.

**The approved invariant, precisely:**

> Within a single `ReactionMeasurement` row, the anchor and the endpoint must
> use the same declared `PriceBasis`. Different measures for the same
> instrument may legitimately use different bases from each other.

Concretely:
- `INTRADAY_60M` uses intraday `AS_TRADED` for **both** anchor and endpoint.
- `RELEASE_SESSION` / `SESSION_PLUS_1` / `SESSION_PLUS_5` use daily
  `SPLIT_ADJUSTED` for **both** anchor and endpoint.
- An instrument is **never** rejected merely because its intraday and daily
  series carry different bases — that is now an expected, permanent fact about
  the provider, not an anomaly.
- A measurement that would combine two different bases within itself is a hard
  failure — no row is written. This is enforced at the type level (the engine
  takes one `priceBasis` per call, applied to both prices it reads) and checked
  again in `verify-reaction-measurements`.
- The old cross-series ratio check (`intradayDailyBasisRatio` /
  `seriesShareBasis` in v2) is **demoted to a reported diagnostic**: computed
  and logged so a genuine provider anomaly (an undeclared split, a bad tick) is
  still visible, but it is no longer a precondition for writing `INTRADAY_60M`.

**Why this is safe:** no v3 measurement spans two series. `INTRADAY_60M` reads
both its prices from the intraday series; every `SESSION_*` measure reads both
from the daily series. A split cannot occur inside a 60-minute intraday window
(splits take effect at a session boundary), and the daily series is
split-adjusted throughout. The old guard would otherwise **suppress valid
`INTRADAY_60M` measurements for XLK and XLE** — the two instruments whose mixed
v2 anchors caused §1.2 in the first place.

**Tests required (implementation plan Task 8):**
1. XLK/XLE-style differing intraday-vs-daily basis declarations do **not**
   suppress `INTRADAY_60M` — the measurement is produced.
2. A single measurement given prices declared on two different bases is
   **rejected** — no row.

This reverses the originally-drafted §10 test 16 and is a net correctness
improvement: it removes a false rejection without weakening the same-basis
guarantee within any one row.

---

## 14. Decisions — locked 2026-09-12

1. **Early-close table.** Kept, isolated inside the canonical calendar module,
   cited, with an explicit supported range and a **fail-closed rule** outside it.
   A normal 16:00 close is never assumed where the assumption could change
   session assignment. See §4.4.
2. **`sessionBasis` disclosure.** A small per-row badge on cross-instrument
   surfaces — *not* a regrouping of the UI into sections. The badge label stays
   terse (`RTH`, `FUT`, `24/7`); the Method/provenance block carries the full
   meaning (US equity regular hours; extended futures session; continuous
   24/7). **Stage 4 only — no UI work in Stage 1.**
3. **`SESSION_PLUS_5` label.** User-facing label is **"5 sessions"**. "One week"
   is rejected as approximate. Internal enum stays `SESSION_PLUS_5`.
4. **TypeScript language server.** Installed globally as developer tooling
   (`typescript-language-server@6.0.0`); it reuses the project's own TypeScript.
   No entry was added to `package.json` or `package-lock.json`.

### 14.1 Open items deferred out of this work

1. **Ex-dividend contamination of `SESSION_PLUS_5`.** Yahoo daily OHLC is
   split-adjusted but **not** dividend-adjusted, so a 6-session window that
   contains an ex-dividend date includes a real price drop unrelated to the
   event. This is most material for `TLT` (monthly distributions) and the sector
   ETFs (quarterly). It is a **pre-existing v2 behaviour, not a v3 regression**,
   and it is not fixed here: the alternative basis (`adjclose`,
   `SPLIT_DIVIDEND_ADJUSTED`) is retroactively restated by the provider whenever
   a later dividend is paid, which would break point-in-time reproducibility —
   a property this project values more highly. v3 keeps `SPLIT_ADJUSTED`,
   records it per row, and documents the limitation. Revisit with a provider
   that serves a stable total-return series.
