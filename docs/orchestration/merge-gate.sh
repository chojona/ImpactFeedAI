#!/usr/bin/env bash
# Deterministic merge gate for agent PRs (see merge-policy.md §4).
#
#   docs/orchestration/merge-gate.sh <pr-number>           # check only
#   docs/orchestration/merge-gate.sh <pr-number> --merge   # check, then squash-merge
#
# Every check is evaluated against ONE head SHA read at the start. The merge
# call passes that SHA to GitHub (`sha=`), so GitHub refuses the merge if the
# branch moved after the gate ran: an approval can never be applied to a
# different head than the one it names. Needs: gh (authenticated), jq.
set -euo pipefail

REPO="chojona/ImpactFeedAI"
QUALITY_CHECK="Quality checks"
QUALITY_APP_ID=15368 # github-actions; statuses posted with a personal token do not count
MARKER="<!-- impactfeed-review -->"

PR="${1:?usage: merge-gate.sh <pr-number> [--merge]}"
MODE="${2:-check}"
failures=()
fail() { failures+=("$1"); }

pr_json="$(gh api "repos/$REPO/pulls/$PR")"
HEAD="$(jq -r .head.sha <<<"$pr_json")"
HEAD_REF="$(jq -r .head.ref <<<"$pr_json")"
echo "PR #$PR head $HEAD ($HEAD_REF)"

# 0. The pulls API can lag a fresh push (observed 2026-11-27 on #49), so the
#    head must also match the branch ref itself. A mismatch means "moving":
#    re-run later. The merge call below is pinned to $HEAD either way.
ref_sha="$(gh api "repos/$REPO/git/ref/heads/$HEAD_REF" --jq .object.sha)"
[[ "$ref_sha" == "$HEAD" ]] || fail "head is moving: pulls API says $HEAD, branch ref says $ref_sha"

# 1. Open, not draft, no do-not-merge label.
[[ "$(jq -r .state <<<"$pr_json")" == "open" ]] || fail "PR is not open"
[[ "$(jq -r .draft <<<"$pr_json")" == "false" ]] || fail "PR is a draft"
jq -e '[.labels[].name] | index("do-not-merge") | not' <<<"$pr_json" >/dev/null \
  || fail "do-not-merge label present"

# 2. Required check succeeded on this exact head, from the expected app.
quality="$(gh api "repos/$REPO/commits/$HEAD/check-runs?per_page=100" --jq \
  "[.check_runs[] | select(.name==\"$QUALITY_CHECK\" and .app.id==$QUALITY_APP_ID)]
   | if length==0 then \"missing\"
     elif all(.conclusion==\"success\") then \"success\"
     else (map(.conclusion // .status) | join(\",\")) end")"
[[ "$quality" == "success" ]] || fail "$QUALITY_CHECK on $HEAD: $quality"

# 3. Up to date with main and mergeable.
behind="$(gh api "repos/$REPO/compare/main...$HEAD" --jq .behind_by)"
[[ "$behind" == "0" ]] || fail "branch is $behind commit(s) behind main"
[[ "$(jq -r .mergeable <<<"$pr_json")" == "true" ]] || fail "GitHub reports not mergeable"

# 4. Latest attestation must name this exact head and approve it.
attest="$(gh api --paginate "repos/$REPO/issues/$PR/comments" --jq \
  "[.[] | select(.body | contains(\"$MARKER\"))] | .[]" | jq -s 'last')"
if [[ "$attest" == "null" || -z "$attest" ]]; then
  fail "no review attestation"
else
  body="$(jq -r .body <<<"$attest")"
  a_head="$(grep -oE '^Head: *[0-9a-f]{40}' <<<"$body" | grep -oE '[0-9a-f]{40}' | head -1 || true)"
  a_verdict="$(grep -oE '^Verdict: *(APPROVE|CHANGES_REQUESTED)' <<<"$body" | awk '{print $2}' | head -1 || true)"
  echo "latest attestation: head=${a_head:-none} verdict=${a_verdict:-none} ($(jq -r .html_url <<<"$attest"))"
  [[ "$a_head" == "$HEAD" ]] || fail "latest attestation is for ${a_head:-no SHA}, not current head (stale)"
  [[ "$a_verdict" == "APPROVE" ]] || fail "latest attestation verdict is ${a_verdict:-missing}"
fi

# 5. No unresolved review threads.
unresolved="$(gh api graphql -F n="$PR" -f query='query($n:Int!){repository(owner:"chojona",name:"ImpactFeedAI"){pullRequest(number:$n){reviewThreads(first:100){nodes{isResolved}}}}}' \
  --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved|not)] | length')"
[[ "$unresolved" == "0" ]] || fail "$unresolved unresolved review thread(s)"

# 6. Paths that always need the owner (merge-policy.md §4, escalation list).
sensitive="$(gh api --paginate "repos/$REPO/pulls/$PR/files" --jq '.[].filename' \
  | grep -E '^(\.github/|prisma/|docs/orchestration/|vercel\.json$)' || true)"
[[ -z "$sensitive" ]] || fail "touches owner-approval paths: $(tr '\n' ' ' <<<"$sensitive")"

if ((${#failures[@]})); then
  printf 'GATE FAIL\n'; printf '  - %s\n' "${failures[@]}"; exit 1
fi
echo "GATE PASS for $HEAD"

if [[ "$MODE" == "--merge" ]]; then
  gh api -X PUT "repos/$REPO/pulls/$PR/merge" -f merge_method=squash -f sha="$HEAD" \
    --jq '"merged: \(.merged) \(.sha)"'
fi
