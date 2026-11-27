# Merge policy (agent-driven development)

Status: **Unattended merging is DISABLED.** Each merge requires Jonathan's explicit approval for the current PR head. Only Jonathan changes this status.

## 1. Safeguards

| # | Safeguard | Enforced by | State |
|---|-----------|-------------|-------|
| S1 | `main` requires a pull request; required status check `Quality checks` (pinned to the github-actions app, id 15368), strict (branch up to date) | GitHub | VERIFIED 2026-11-27 |
| S2 | Protection applies to admins (`enforce_admins`), so no agent can bypass it | GitHub | VERIFIED 2026-11-27 |
| S3 | Force pushes and deletion of `main` blocked; linear history required | GitHub | VERIFIED 2026-11-27 |
| S4 | Squash merge only (merge commits and rebase merges disabled at repo level) | GitHub | VERIFIED 2026-11-27 |
| S5 | Conversation resolution required before merge | GitHub | VERIFIED 2026-11-27 |
| S6 | Independent review attestation on the exact current head SHA (§3) | Orchestrator, via `merge-gate.sh` | VERIFIED by demo (§7); not machine-enforced by GitHub (see §8) |
| S7 | Explicit owner authorization for the current PR head | `merge-gate.sh` | Covered by offline tests |

GitHub "required approvals" is deliberately set to **0**: every agent pushes
as the single owner account, and GitHub does not let an author approve their
own PR, so a required approval would block every merge. `dismiss_stale_reviews`
is on regardless. Independent approval is enforced by S6. `Dependency security
report` is soft-fail by design and is not a required check. Vercel deployments
are disabled (#47); the app runs locally only.

### Evidence (GitHub API read-back, 2026-11-27T17:21:43Z)

`GET /repos/chojona/ImpactFeedAI/branches/main/protection`, fields extracted:

```json
{"required_status_checks":{"strict":true,"checks":[{"context":"Quality checks","app_id":15368}]},
 "enforce_admins":true,
 "required_pull_request_reviews":{"required_approving_review_count":0,"dismiss_stale_reviews":true,
   "require_code_owner_reviews":false,"require_last_push_approval":false},
 "required_linear_history":true,"allow_force_pushes":false,"allow_deletions":false,
 "required_conversation_resolution":true,"lock_branch":false}
```

`GET /repos/chojona/ImpactFeedAI`:
`{"allow_squash_merge":true,"allow_merge_commit":false,"allow_rebase_merge":false,"allow_auto_merge":false,"delete_branch_on_merge":true}`.
Rulesets: none.

Behavioural checks (same day, owner admin token):

| Test | Result |
|------|--------|
| Direct `git push origin HEAD:main` as admin | Rejected: `GH006: Protected branch update failed` |
| Squash-merge #49 while `Quality checks` in progress | HTTP 405 `Required status check "Quality checks" is in progress.` |
| Merge-commit method on #49 | HTTP 405 `Merge commits are not allowed on this repository.` |
| Rebase method on #49 | HTTP 405 `Rebase merges are not allowed on this repository.` |
| Squash-merge #49 pinned to the previously approved SHA after a new push | HTTP 409 `Head branch was modified. Review and try the merge again.` |
| Squash-merge approved #43 after `main` moved (branch 1 behind) | HTTP 405 `Required status check "Quality checks" is expected.` |

## 2. Who does what

- **Implementer**: one worker per task, in its own worktree, on its own
  branch. Owns only the files listed for its task in `backlog.md`. Runs
  `npm run verify`, pushes, opens the PR, and fixes review findings.
- **Reviewer**: a fresh agent that did not write the change, preferably on a
  different provider than the implementer. Reviews the diff against
  CLAUDE.md (data integrity rules especially) and posts an attestation.
- **Orchestrator**: assigns tasks, routes findings, runs the gate, and reports the verdict.
- **Owner**: Jonathan (`chojona`) authorizes each merge for the current head.

## 3. Review attestation

The reviewer posts one PR comment in exactly this form:

```
<!-- impactfeed-review -->
Reviewer: <provider/model>, thread <thread link or id>
Head: <full 40-char head SHA reviewed>
Verdict: APPROVE | CHANGES_REQUESTED
Findings: <numbered list, or "none">
```

Only the **latest** attestation on the PR counts, and only while its `Head`
equals the PR's current head SHA. **Any** change to the head (a new commit, a
merge from `main`, a rebase, a conflict resolution) produces a new SHA and
therefore needs a fresh review of that SHA; there are no exemptions. A
re-review is a new agent given the previous findings.

## 4. Merge gate

`docs/orchestration/merge-gate.sh <pr>` checks, against one head SHA read at
the start:

0. The pulls API head equals the branch ref (the pulls API can lag a push).
1. PR open, not draft, no `do-not-merge` label.
2. `Quality checks` from the github-actions app succeeded on that SHA.
3. Branch is 0 commits behind `main` and GitHub reports it mergeable.
4. The latest attestation names that exact SHA and says APPROVE.
5. No unresolved review threads.
6. Neither side of a renamed path, nor any other changed path, touches
   `.github/`, `prisma/`, `docs/orchestration/`, `.agents/`, `vercel.json`,
   `package.json`, or `CLAUDE.md`. These changes go to Jonathan directly.
7. Jonathan signed the authorization payload for this repository, PR number,
   current head SHA, and latest recorded head force-push. GitHub reviews and
   comments provide no merge authorization. A new head or recorded force-push
   requires a new signature.

Set up the verifier in an environment Jonathan controls. Install the reviewed
gate and an OpenSSH allowed-signers file there, with a line containing the
principal `chojona` followed by Jonathan's dedicated public signing key.
Keep the verifier, its configuration, and the corresponding private key
outside agent access. The existing shared GitHub SSH credential is unsuitable.
Set `MERGE_GATE_ALLOWED_SIGNERS` to the trusted file's absolute path.

Run the gate to obtain the exact payload it prints when authorization is
missing. Jonathan saves those four lines, ending with a newline, to
`authorization.txt` and signs it with his private key:

```sh
ssh-keygen -Y sign -f /path/to/owner-signing-key -n impactfeed-merge-authorization authorization.txt
```

Set `MERGE_GATE_SIGNATURE` to the resulting `authorization.txt.sig` and rerun
the gate in the trusted environment. Both verification inputs are required.
An agent-run verdict provides no authorization if agents can replace the
verifier or its allowed-signers file.

The gate prints a verdict and exits zero only when every check passes.
It checks the branch ref again before reporting a pass and rejects GitHub API,
network, and JSON errors. Run the offline tests with
`docs/orchestration/test-merge-gate.sh`.

The orchestrator additionally checks the diff and review:

8. UI check (any PR touching `src/app/**` or `src/components/**`): the
   reviewer runs a local production build (`npm run build && npm run start
   -- -p <free port>`), drives every affected route with Playwright at 390px
   and 1440px, and reports HTTP status, console errors, horizontal overflow
   (`scrollWidth > innerWidth`) and screenshot paths (saved outside the repo).
   Both the live read-only database and the no-`DATABASE_URL` empty state are
   checked when the change can affect empty states.
9. Scope: the diff stays inside the task's owned files, adds no dependency
   without it being flagged in the PR body, contains no schema migration, no
   secrets, no committed third-party data whose licence is unverified, and no
   research claim that the data cannot support.
10. One merge at a time. After each merge, every other open PR is behind
   `main`; updating it changes its SHA, so it needs CI and a fresh review again.

Escalate to the owner instead of merging when: a gate item is ambiguous, the
reviewer and implementer disagree after two rounds, or the change touches
`prisma/`, `.github/`, `docs/orchestration/`, licensing, or anything outside
the authorized scope.

## 5. Hard limits (never automated)

No production database writes, schema migrations, paid APIs, live trading,
unlicensed data acquisition, secret exposure, branch-protection changes or
bypass, or force pushes to `main`. A failing task gets at most two automatic
fix rounds, then it is marked BLOCKED in `backlog.md` and escalated.

## 6. Can a workflow merge on an outdated approval?

- **Gate verdict:** applies to the SHA it prints. For a separately authorized
  merge, GitHub's expected-SHA parameter rejects a head that moved after the
  gate ran (§7).
- **GitHub auto-merge:** disabled at repo level (`allow_auto_merge: false`).
- **GitHub Actions:** no workflow in `.github/workflows/` merges or approves;
  `ci.yml` runs with `permissions: contents: read`.
- **Any agent with the owner token:** yes, in principle. An agent can call the
  merge API directly once `Quality checks` passes, because GitHub itself does
  not know about attestations. This is the gap §8 closes.

## 7. Historical demonstration (PR #49, before unattended merging was disabled)

1. Orchestrator opened #49 (`docs/README.md` index) at `d8c35b4`.
2. Merge attempts during CI and with merge/rebase methods were refused (§1).
3. An independent reviewer (Cursor composer-2.5) approved `d8c35b4`; the gate
   passed.
4. The orchestrator pushed `e65ae00` (review nit). Immediately afterwards the
   pulls API still reported `d8c35b4` and the first gate version passed on it;
   the pinned merge returned **409**. The gate now cross-checks the branch ref
   (check 0). Re-run: **GATE FAIL**: `Quality checks` in progress, attestation
   is for `d8c35b4` (stale).
5. A fresh reviewer (new Cursor composer-2.5 agent) approved `e65ae00`. The
   gate first failed only on `Quality checks` in progress, then passed once CI
   finished, and `merge-gate.sh 49 --merge` squash-merged it as `a3d86f7`.
6. After that merge, the gate failed every other approved PR (#41, #43, #45,
   #47) as 1 commit behind `main`, and GitHub itself refused to merge #43.

## 8. Proposal: machine-enforced review gate (needs owner approval)

The attestation is a comment any agent could post, because every agent uses
the same GitHub identity. Two complementary fixes, both $0:

**A. Separate reviewer identity (recommended).** Create a GitHub App (or a
machine-user account) used only by reviewer agents. Then set
`required_approving_review_count: 1`, `dismiss_stale_reviews: true` and
`require_last_push_approval: true`. GitHub then refuses any merge without an
approving review from a non-author on the latest push, natively. The App's
private key lives outside the repo and is handed only to reviewer threads
(short-lived installation tokens). Limitation: all agents run as the same OS
user on one machine, so keeping the key away from implementers is procedural,
not absolute.

**B. Required `review-gate` status (interim, no new identity).** A workflow on
`pull_request_target` and `issue_comment` that runs the **base-branch** copy
(so a PR cannot edit it), never checks out PR code, has only
`statuses: write` + `pull-requests: read`, and sets a `review-gate` status on
the head SHA to success only when the latest attestation names that SHA and
approves. Add it as a required check pinned to the github-actions app id, so a
status posted with a personal token does not count. A new push has no status,
so it is blocked until re-reviewed. Limitation: proves SHA freshness, not that
the reviewer was independent.

## 9. Can the workflow change its own safeguards?

Today, **yes**:

- The `gh` token is a classic PAT with `repo` scope, and the account is a repo
  admin. Any agent can change or delete branch protection, re-enable merge
  commits, or turn on auto-merge. GitHub cannot stop an admin token from
  changing protection.
- Git pushes go over SSH, which ignores token scopes, so an agent can push
  changes to `.github/workflows/` on a branch. A PR that edits `ci.yml` runs its
  own edited copy of `Quality checks` on `pull_request`, so it could weaken the
  very check that gates it. Only the orchestrator's path rule (gate check 6)
  stops such a PR from merging.

Fix (owner action, $0): run agents with a **fine-grained PAT** for this repo
only with Contents, Pull requests and Issues read/write, Checks and Commit
statuses read, and **no Administration and no Workflows** permission, and
switch agent remotes from SSH to HTTPS with that token. Agents then cannot
change protection or push workflow files at all. Keep the admin token for the
owner. Combined with 8A, a policy change (this file, `.github/`, protection)
can only land with the owner's own action.

## 10. Remaining risks

1. Self-attested reviews (§8) until a separate reviewer identity exists.
2. Agents hold an admin token and an SSH key (§9).
3. A PR can rewrite `ci.yml` and make `Quality checks` pass on itself; only
   gate check 6 and owner review stop it.
4. Every merge makes every other open PR stale; with strict up-to-date checks
   and mandatory re-review, merge throughput is about one PR per CI-plus-review
   cycle.
5. The pulls API can briefly report an old head after a push; mitigated by
   gate check 0 and the final branch ref check.
6. The scheduled orchestration cycle (T3) is configured by the orchestrator
   itself; its prompt says merges stay disabled while this file says so, but
   that is an instruction, not a control.
