# Personal macro research terminal — frontend specification

Status: **P0 implemented** (this document). Does not replace
[architecture.md](architecture.md) or [roadmap.md](roadmap.md).

Audience: solo researcher. Not a commercial SaaS surface.

## Intent

Turn ImpactFeedAI into a daily personal terminal:

1. Morning brief  
2. Economic calendar over stored releases  
3. Historical event exploration  
4. Cross-asset pattern research  
5. Data-quality visibility  

Regimes, notebooks and AI remain out of nav until their data layers exist.

## Route map (shipped)

| Route | Role |
| --- | --- |
| `/` | Redirects to `/brief` |
| `/brief` | Daily brief: coverage pulse, upcoming sourced releases, recent measured reactions |
| `/calendar` | Agenda of ingested releases (default: 2y lookback + 30d ahead) |
| `/feed` | Event library (nav label: Events) |
| `/events/[id]` | Event research desk |
| `/patterns` | Pattern library |
| `/quality` | Coverage table + eligible-but-unpriced backlog |

Not exposed in navigation: `/regimes`, `/notebooks`, marketing pricing.

## Component inventory

### Reused

- `EventCard`, `StatusBadges`, `CoverageTable`, `PageHeader`, `PageSection`,
  `Panel`, `Metric`, `DataStatePanel`, `Header` shell tokens
- Services: `getLibraryCoverage`, plus new read helpers on `eventQueries`

### Added (P0)

- `components/terminal/LibraryCoverageMetrics.tsx`
- `components/terminal/UpcomingReleaseList.tsx`
- `components/terminal/EventCardGrid.tsx`
- `components/terminal/CalendarAgenda.tsx`
- `components/terminal/PendingReactionList.tsx`
- Query helpers: `listUpcomingSourcedReleases`, `listRecentMeasuredEvents`,
  `listCalendarEvents`, `listPendingReactionEvents`

## Integrity rules

- No mock production fixtures; empty database → empty / explicit data states  
- Upcoming list requires VERIFIED/SCHEDULED + non-empty timing source + future
  `releaseAt`  
- Calendar never invents official schedule rows  
- Missing values stay null; surprise coloring still uses `higherIsBetter`  
- No Prisma schema changes; no regime classification in this phase  

## Priority after P0

1. Integrity gates R0/R1 and consensus coverage (roadmap)  
2. Market-context panel / regimes when snapshots exist  
3. Personal notebooks  
4. Statistical research lab / analogs / grounded AI  

## Commercial surface

Pricing and SaaS CTAs are removed from the primary workflow. The previous
landing composition under `components/landing/` remains in the tree but is no
longer routed from `/`.
