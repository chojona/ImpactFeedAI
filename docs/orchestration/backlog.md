# Engineering backlog

Maintained by the orchestrator thread. One row per task. A task may start
only when every task in `Depends on` is DONE, and no two IN PROGRESS tasks
may own the same file. Merge rules: [merge-policy.md](merge-policy.md).

Status values: TODO, IN PROGRESS, IN REVIEW, BLOCKED, DONE, DROPPED.
Active worker cap: 6.

## Active

| ID | Task | Status | Owner (provider/model, thread) | Owns (files) | Depends on | PR |
|----|------|--------|--------------------------------|--------------|------------|----|
| A1 | Phase 1 integration and research-readiness audit (read-only) | IN PROGRESS | Claude Opus 5.5, user thread "Phase 1 Integration Readiness Audit" | none (read-only) | — | — |
| A2 | Independent audit: historical macro timing and first-print actuals; status of `feat/phase-1.1-alfred-point-in-time` (read-only) | IN PROGRESS | Codex gpt-6.2-sol, delegated by orchestrator | none (read-only) | — | — |
| A3 | Audit: NQ archive qualification and reaction measurement integration (read-only) | IN PROGRESS | Claude Opus 5.5, delegated by orchestrator | none (read-only) | — | — |
| A4 | Audit: data acquisition coverage and licensing restrictions (read-only) | IN PROGRESS | Claude Opus 5.5, delegated by orchestrator | none (read-only) | — | — |
| A5 | Audit: terminal UI and end-to-end usability (read-only) | IN PROGRESS | Claude Sonnet 5.5, delegated by orchestrator | none (read-only) | — | — |
| D1 | Safe dev dependency bumps; Dependabot groups limited to minor/patch | IN REVIEW | Cursor, user thread "Assess Dependabot PR Merge Safety" | package.json, package-lock.json, .github/dependabot.yml | — | #35 |
| D2 | Dependabot production group (8 updates, incl. yahoo-finance2 3→4, framer-motion 12→14) | IN REVIEW | Dependabot; assessed by the D1 thread | package.json, package-lock.json | D1 | #32 |
| O1 | Orchestration backlog and merge policy (this file) | IN REVIEW | Orchestrator | docs/orchestration/* | — | this PR |

## Next (filled in from audit findings)

Implementation tasks will be added here once A1–A5 report, each with a
disjoint file set.

## Done

| ID | Task | PR |
|----|------|----|
