# Historical macro actuals: Phase 0.5 policy

Policy version: `phase-0.5-actual-provenance-1`, November 5, 2026.
Implementation boundary: `src/services/macro/actualProvenance.ts`.
This policy does not certify any existing actual, deploy a schema, or reconstruct
missing vintages. Phase 1 must use this boundary before accepting macro inputs.

## What a value can claim

Value kind and availability quality are independent dimensions:

| Value kind | Required evidence | Permitted claim |
| --- | --- | --- |
| `INITIAL_REPORTED` | Immutable source revision, archived payload, and independently reviewed evidence linking this value/metric/period to its first release | First print; historical eligibility still requires availability evidence |
| `REVISED_HISTORICAL` | Immutable, source-backed revision identity and payload for this period | Revised value available at the evidenced revision time; never substitute for first print |
| `CURRENT_DATABASE` | A presently stored value or latest retrieval | Current stored description only; no inferred historical vintage |
| `UNRESOLVED` | Missing, conflicting, or insufficient identity/provenance | Explicitly unqualified |

`VERIFIED_INSTANT` requires evidence of publication of this exact revision and
its usable availability, with `publishedAt <= availableAt`. A market/observation
date, reference period, scheduled release time, fetch timestamp or insertion
timestamp cannot supply that evidence. `CONSERVATIVE_DATE_BOUND` requires an
independently reviewed source date and named/versioned timezone/end-of-day
policy; exact publication time remains null. A vintage date alone cannot
establish a same-day release instant. `UNRESOLVED` availability is ineligible.

Fields passing the pure eligibility checker are necessary conditions. A hash
and URL do not independently prove a document's authenticity, first-print
status, numerical transform or correct timing. The source review must establish
those facts before constructing a qualified `HistoricalActual`. There is no
`certify=true` operation, and no legacy-row promotion by matching numbers.

## Research eligibility

Require canonical metric/series identity, finite values, explicit units,
reference period, provider/revision identity, retained evidence with SHA-256,
publication and availability semantics, retrieval and insertion timestamps.
Evidence URLs must exclude credentials; retain request parameters separately
with secrets removed. Store source values and every transform input, including
previous-period values needed for YoY/MoM changes. A correct headline value
cannot certify an unarchived transform denominator.

An ALFRED single-day snapshot records the provider's information set for that
date. Its row interval does not establish the date the value was published or
whether it was the first print. The adapter leaves release stage unresolved
unless independently reviewed publication evidence ties the exact series,
period, date, and value to a stage. Provider responses explicitly limited to
initial releases or demonstrably complete revision histories can establish the
stage of an archived observation. In each mode, independent publication
evidence is required for a date-bound availability claim. First-print
selection requires both the initial stage and the initial reported value kind.

Macro transforms require all operands to share a validated single-day snapshot
or a single point-in-time panel selection. Snapshot arithmetic is descriptive
unless its inputs also qualify under the point-in-time policy. Input lineage
includes the numerator and denominator of any returned prior. The selection
freeze excludes rows recorded after `recordedThrough` before revision
conflicts are evaluated.

Historical public-information reconstruction may use evidence retrieved later,
but requires `availableAt < cutoff` and `recordedAt <= recordedThrough`.
System replay additionally requires both retrieval and insertion strictly
before cutoff. A later revision cannot enter an earlier cutoff; exact equality
is excluded. Revised values can be prior context only when that revision was
already available. Initial-actual surprise research requires first-print proof
and independently verified pre-release consensus with the same metric/unit.
The focal actual is never its own pre-release context.

The contract distinguishes those modes and returns reason codes. Selecting
revisions across periods, computing features, data-freeze fingerprints and
materializing context remain Phase 1 work, not implementation claims here.

## Append-only storage design (not deployed)

Retain `DataRelease` unchanged as the legacy presentation/ingestion record.
Add the following through a separately validated additive Prisma migration on
an isolated database; do not add revision columns to overwrite the sole actual.

| Proposed entity | Fields / constraints |
| --- | --- |
| `MacroSeriesDefinition` (or shared `ContextSeries`) | Stable metric/provider series key, unit, frequency, source timezone, transform/basis definition and version; immutable definition versions |
| `MacroActualObservation` (or shared `ContextObservation`) | UUID, series-definition FK, optional legacy release FK with delete restriction, reference start/end, source value and normalized value, revision key and stage, value kind, vintage date, publication instant/date/precision, available instant/quality/policy, fetched/recorded timestamps, ingestion version |
| `SourceEvidence` | Immutable payload/content-addressed object reference, SHA-256, sanitized source URL, nonsecret request/vintage parameters, fetched timestamp, reviewer and verification timestamp; raw source evidence retained alongside transformed inputs |
| `ObservationEvidence` | Observation FK → evidence FK, role (`revision`, `first_print`, `publication`, `availability`, `transform_input`); no cascading deletion of cited evidence |
| `ObservationConflict` | Claimed revision identity, both evidence references/payload hashes and reason; conflicting observations quarantined, never last-write-wins |

Natural identity is `(seriesDefinitionId, referencePeriodStart,
referencePeriodEnd, providerRevisionKey, estimateStage)`, with non-null revision
identity on historically qualified observations. Re-fetch of an identical
payload is idempotent. A new revision is a new observation. A conflicting
payload under the same immutable key is not an update. Providers without a
stable revision key can supply append-only retrieval snapshots, explicitly
unqualified for historical reconstruction.

Use unique identity constraints, finite-number and valid-period checks, required
publication/availability pairs for qualified statuses, and indexes on
`(seriesDefinitionId, referencePeriodStart, availableAt)` and
`(seriesDefinitionId, recordedAt)`. Qualification is an append-only review
record referencing immutable evidence/observation IDs; do not mutate a past
snapshot when evidence improves. Application roles must lack UPDATE/DELETE on
observation/evidence tables. Test both empty and pre-context migration replay,
immutability, conflicts and cutoff queries on isolation before deployment.
No migration is included in Phase 0.5 because that isolation/evidence workflow
has not been accepted; the design is compatible with the Phase 1 model plan.

## Existing data and permitted analyses

The fresh read-only report identifies 21 actuals, zero canonical metric keys,
zero reference periods and zero actual-source citations. All are
`CURRENT_DATABASE`, with unresolved vintage and availability. Twenty forecasts
are unverified and one is missing; zero verified consensus exists. Do not infer
first prints from headlines or seed `:initial:` natural keys.

Curated FRED ingestion tries a day-level vintage and can fall back to current
history; that fallback is not persisted in the current schema. Bulk FRED/BLS
history is current history. These writers remain descriptive sources, not
producers of this qualified observation contract. Before using them for Phase 1,
archive vintages and propagate source/fallback/evidence status end-to-end.
ALFRED and FRED describe the real-time period as a date-based information-set
selection; it does not identify intraday public availability. See [FRED real-time
period documentation](https://fred.stlouisfed.org/docs/api/fred/realtime_period.html)
and [observations API](https://fred.stlouisfed.org/docs/api/fred/series_observations.html).

| Existing/proposed analysis | Status |
| --- | --- |
| Event library, current recorded actuals/prior values | Descriptive, retaining provenance and timing cautions |
| Four-window price returns; per-measure distributions/category summaries | Descriptive, disclose missing windows, canonical calendar and native-basis limits; v3 is retained, not retrospectively certified |
| Actual vs forecast display | Unverified description; stored surprise is not verified historical surprise |
| Pre-release macro state/regimes, vintage-consistent inflation/labor/growth | Blocked for legacy actuals |
| Standardized surprise, actual-conditioned PIT studies, event forecasts/trading simulations | Blocked without independently proven initial actual + consensus timing and qualified prices |
| Independent volatility/rates feature development with synthetic inputs | Can be reviewed separately after the Phase 0.5 gate; no authorization to publish/backfill historical context is implied |

No historical actual was edited, no vintage was fabricated, and no numeric
agreement was treated as proof of release-time availability.
