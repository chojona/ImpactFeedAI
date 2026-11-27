# Merge policy (agent-driven development)

Status: **UNATTENDED MERGING DISABLED.** The orchestrator may prepare,
review and report on PRs, but merges need the owner's go-ahead per PR until
every safeguard in §1 is marked VERIFIED below. Only the repository owner
changes this line.

## 1. Safeguards (all required before unattended merging)

| # | Safeguard | Enforced by | State |
|---|-----------|-------------|-------|
| S1 | `main` branch protection: required status check `Quality checks`, strict (branch up to date) | GitHub | NOT SET |
| S2 | Protection applies to admins (`enforce_admins`), so no agent can bypass it | GitHub | NOT SET |
| S3 | Force pushes and deletion of `main` blocked; linear history required | GitHub | NOT SET |
| S4 | Squash merge only (merge commits and rebase merges disabled at repo level) | GitHub | NOT SET |
| S5 | Conversation resolution required before merge | GitHub | NOT SET |
| S6 | Independent review attestation on the exact head SHA (§3) | Orchestrator | DEFINED |
| S7 | Merges serialized through the orchestrator thread only (§4) | Orchestrator | DEFINED |

GitHub "required approvals" is deliberately **not** enabled: every agent
pushes as the single owner account, and GitHub does not let an author approve
their own PR, so a required approval would block every merge. Independent
approval is enforced by S6 instead. `Dependency security report` is
soft-fail by design and is not a required check. The `Vercel` preview
deployment is also non-gating: the free plan caps preview builds (100/day) and
fails with `build-rate-limit` when exhausted; never upgrade the plan to clear it.

## 2. Who does what

- **Implementer**: one worker per task, in its own worktree, on its own
  branch. Owns only the files listed for its task in `backlog.md`. Runs
  `npm run verify`, pushes, opens the PR, and fixes review findings.
- **Reviewer**: a fresh agent that did not write the change, preferably on a
  different provider than the implementer. Reviews the diff against
  CLAUDE.md (data integrity rules especially) and posts an attestation.
- **Orchestrator**: assigns tasks, routes findings, checks the gate, merges.
  It is the only role that merges.

## 3. Review attestation

The reviewer posts one PR comment in exactly this form:

```
<!-- impactfeed-review -->
Reviewer: <provider/model>, thread <thread link or id>
Head: <full 40-char head SHA reviewed>
Verdict: APPROVE | CHANGES_REQUESTED
Findings: <numbered list, or "none">
```

An attestation is valid only while `Head` equals the PR's current head SHA.
Any push after it (other than a pure `main` merge/rebase with no conflict
resolution in owned files) invalidates it and needs a fresh review; a
re-review may be a new agent given the previous findings.

## 4. Merge gate (checked by the orchestrator, in this order)

1. PR is not draft and has no `do-not-merge` label.
2. `Quality checks` succeeded on the current head SHA.
3. PR is mergeable and up to date with `main`.
4. A valid APPROVE attestation (§3) exists for the current head SHA, from a
   reviewer that is not the implementer.
5. Every finding from earlier attestations is fixed or explicitly answered,
   and no review thread is unresolved.
6. UI check (any PR touching `src/app/**` or `src/components/**`): the
   reviewer runs a local production build (`npm run build && npm run start
   -- -p <free port>`), drives every affected route with Playwright at 390px
   and 1440px, and reports in the attestation: HTTP status, console errors,
   horizontal overflow (`scrollWidth > innerWidth`), and screenshot paths
   (saved outside the repo). Both the live read-only database and the
   no-`DATABASE_URL` empty state are checked when the change can affect empty
   states. The server is stopped afterwards. There is no hosted preview: the
   app runs locally only (see #47).
7. Scope check: the diff stays inside the task's owned files, adds no
   dependency without it being flagged in the PR body, contains no schema
   migration, no secrets, no committed third-party data whose licence is
   unverified, and no research claim that the data cannot support.
8. Squash merge. One merge at a time; after each merge, other open PRs are
   updated from `main` and must pass the gate again.

Escalate to the owner instead of merging when: a gate item is ambiguous, the
reviewer and implementer disagree after two rounds, or the change touches
`prisma/`, `.github/`, licensing, or anything outside the authorized scope.

## 5. Hard limits (never automated)

No production database writes, schema migrations, paid APIs, live trading,
unlicensed data acquisition, secret exposure, branch-protection bypass, or
force pushes to `main`. A failing task gets at most two automatic retries,
then it is marked BLOCKED in `backlog.md` and escalated.
