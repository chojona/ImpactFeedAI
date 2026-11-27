# Official market-context adapters

Read-only TypeScript adapters that normalize daily market-context observations
for personal research. They do **not** write to Postgres, do **not** change the
Prisma schema, and do **not** compute regime features.

Code: `src/services/market-context/`. Shared observation contract:
`src/types/context.ts` (reconciled with Agent 06 PR #16 feature inputs and
Agent 03 PR #20 knowledge-mode / `revised_latest` vocabulary).

---

## Priority series

| Catalog | `seriesKey` | Unit | Primary | Mirror |
| --- | --- | --- | --- | --- |
| VIXCLS | `market:VIXCLS:level` | `index_points` | Cboe VIX CSV | FRED `VIXCLS` |
| DGS2 | `market:DGS2:yield_pct` | `pct_level` | Treasury `BC_2YEAR` | FRED `DGS2` |
| DGS10 | `market:DGS10:yield_pct` | `pct_level` | Treasury `BC_10YEAR` | FRED `DGS10` |
| DGS3MO | `market:DGS3MO:yield_pct` | `pct_level` | Treasury `BC_3MONTH` | FRED `DGS3MO` |
| T5YIE | `market:T5YIE:breakeven_pct` | `pct_level` | FRED `T5YIE` | — |
| T10YIE | `market:T10YIE:breakeven_pct` | `pct_level` | FRED `T10YIE` | — |
| DFEDTARU | `market:DFEDTARU:target_pct` | `pct_level` | FRED `DFEDTARU` | — |
| DFEDTARL | `market:DFEDTARL:target_pct` | `pct_level` | FRED `DFEDTARL` | — |

---

## FRED current-revised vs vintage

The default FRED `series/observations` pull returns the **current revised**
panel. Adapters mark those rows:

- `quality: "revised_latest"`
- `availableAt: null`
- `retrieval.historicalReconstruction: "ineligible_revised_latest"`

They must **not** be treated as point-in-time valid for historical public
information reconstruction. Pass `vintageAsOf: "YYYY-MM-DD"` to set
`realtime_start=realtime_end` (ALFRED-style as-of). Vintage pulls use
`fred-vintage-ny-eod-v1` availability and may be reconstruction-eligible.

---

## Availability policies (not UTC next-midnight)

| Provider | Policy id | `availableAt` | Precision |
| --- | --- | --- | --- |
| Cboe VIX CSV | `cboe-vix-ny-next-day-open-v1` | Next America/New_York calendar day 00:00 | `date` |
| US Treasury yields | `treasury-h15-1615-et-v1` | Observation date 16:15 ET (H.15 schedule) | `timestamp` |
| FRED vintage as-of | `fred-vintage-ny-eod-v1` | Next NY day 00:00 after vintage date | `date` |
| FRED current revised | — | `null` (unsuitable) | `unknown` |

Consequence for an **08:30 ET** event cutoff on day \(T\): same-day Treasury
yields (available 16:15 ET) and same-day Cboe VIX (available next NY midnight)
are **not** eligible. That matches conservative pre-release information sets.

---

## SYSTEM_REPLAY / `fetchedAt`

Every emitted `MarketContextObservation` sets `fetchedAt` to the retrieval
instant (also mirrored on `retrieval.fetchedAt`). Agent 03 / Agent 06
SYSTEM_REPLAY selectors require `fetchedAt < cutoff` (strict). Missing or
late `fetchedAt` ⇒ `not_known_to_system`.

Helpers: `isEligibleForSystemReplay`, `adapterObservationIneligibilityReasons`
in `eligibility.ts`.

---

## Source evaluation (verified 2026-11-27)

### Cboe — VIX daily history · primary for VIX

| | |
| --- | --- |
| Endpoint | `https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv` |
| Auth | None |
| Shape | CSV `DATE,OPEN,HIGH,LOW,CLOSE`; `DATE` is `M/D/YYYY` |
| Coverage | ~1990-01-02 → present |
| Timing | End-of-day file; CDN refresh is not a verified clock → next NY day open |
| Usage | Personal / research; redistribution restricted under Cboe terms |
| Caveat | Pre-2003 values are methodology backfills, not contemporaneous VXO |

### US Treasury — Daily Par Yield Curve · primary for 3m / 2y / 10y

| | |
| --- | --- |
| Endpoint | `home.treasury.gov/.../xml?data=daily_treasury_yield_curve&field_tdr_date_value=YYYY` |
| Fields | `NEW_DATE`, `BC_3MONTH`, `BC_2YEAR`, `BC_10YEAR` |
| Timing | Conservative bound = Board H.15 16:15 ET on the observation date |
| Usage | Public US government data |

### FRED — breakevens, Fed target, optional mirrors

| | |
| --- | --- |
| Endpoint | `api.stlouisfed.org/fred/series/observations` |
| Auth | `FRED_API_KEY` |
| Vintage | Optional `vintageAsOf` → realtime_start/end |
| Usage | Personal research with citation; 2024 API Terms restrict storing/caching/archiving FRED Content into databases — adapters do not write production DB |

---

## Observation + retrieval contract

`RetrievedMarketObservation`:

1. **`observation`** — lean `MarketContextObservation` including `fetchedAt`
2. **`retrieval`** — provenance: provider, endpoint (API keys redacted), raw
   value, availability policy version, historicalReconstruction status,
   vintageAsOf

FRED credentials follow PR #20's standard: endpoints drop the `api_key`
parameter entirely, and every error message (network failure, body read, JSON
parse, or an unexpected exception, which is rethrown without `cause`) has the
key, its URL-encoded form and any echoed `api_key=` value replaced with
`[REDACTED]`.

`KnowledgeMode`: `PUBLIC_INFORMATION_RECONSTRUCTION` | `SYSTEM_REPLAY`.

---

## Testing

`tests/marketContextAdapters.test.ts` is network-free and covers:

- current-revised vs vintage FRED gating
- 08:30 ET cutoffs vs H.15 / Cboe delays
- SYSTEM_REPLAY `fetchedAt` eligibility
- null/missing values, series registry, key alignment with Agent 06

---

## Non-goals

- Regime percentiles, spreads, realized vol, or categorical labels
- Prisma models / migrations / production writes
- Full ALFRED revision selection (Agent 03)
- Equity `market:SPY:close` adapters (separate coverage; Alpha Vantage free
  daily history is insufficient for deep lookbacks)
