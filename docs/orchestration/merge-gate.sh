#!/usr/bin/env bash
# Read-only gate. See merge-policy.md for the owner authorization format.
set -euo pipefail

reject() { printf 'GATE FAIL: %s\n' "$1" >&2; exit 1; }
trap 'reject "API, JSON, or command error at line $LINENO"' ERR

[[ $# == 1 && $1 =~ ^[1-9][0-9]*$ ]] || reject "usage: merge-gate.sh <pr-number>"
pr="$1"
repo="repos/chojona/ImpactFeedAI"
owner="chojona"

api() { gh api --hostname github.com "$@"; }
json() {
  jq -ers 'if length == 1 then .[0] else error("expected one JSON value") end | '"$@"
}
pages() {
  api "$1" --paginate --slurp | json '
    if type == "array" and length > 0 and all(.[]; type == "array")
    then add else error("invalid paginated response") end'
}

pr_json="$(api "$repo/pulls/$pr")"
head="$(json 'select(.number == $pr) | .head.sha | strings | select(test("^[0-9a-f]{40}$"))' --argjson pr "$pr" <<<"$pr_json")"
head_ref="$(json '.head.ref | strings | select(length > 0)' <<<"$pr_json")"
head_repo="$(json '.head.repo.full_name | strings | select(test("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$"))' <<<"$pr_json")"
# Encode each ref segment so branch names cannot alter the API request.
encoded_ref="$(jq -rn --arg ref "$head_ref" '$ref | split("/") | map(@uri) | join("/")')"
check_head() {
  local ref_sha
  ref_sha="$(api "repos/$head_repo/git/ref/heads/$encoded_ref" | json '.object.sha | strings')"
  [[ "$ref_sha" == "$head" ]] || reject "head changed or is moving"
}

check_head
json '.state == "open" and .draft == false and .mergeable == true
  and (.labels | type == "array" and all(.[]; (.name | type) == "string" and .name != "do-not-merge"))' \
  <<<"$pr_json" >/dev/null || reject "PR must be open, mergeable, and free of draft status and do-not-merge"
api "$repo/compare/main...$head" | json '.behind_by == 0' >/dev/null \
  || reject "could not verify that the head is up to date with main"

api "$repo/commits/$head/check-runs?per_page=100" --paginate --slurp | json '
  select(type == "array" and length > 0 and all(.[]; (.check_runs | type) == "array"))
  | [.[].check_runs[] | select(.name == "Quality checks" and .app.id == 15368)]
  | length > 0 and all(.[]; .conclusion == "success" and .head_sha == $head)' --arg head "$head" >/dev/null \
  || reject "Quality checks did not succeed on the current head"

comments="$(pages "$repo/issues/$pr/comments?per_page=100")"
reviews="$(pages "$repo/pulls/$pr/reviews?per_page=100")"
json 'all(.[]; (.body | type) == "string" and (.user.login | type) == "string" and (.user.type | type) == "string")' \
  <<<"$comments" >/dev/null || reject "invalid comments response"
json 'all(.[]; (.state | type) == "string" and (.commit_id | type) == "string"
  and (.user.login | type) == "string" and (.user.type | type) == "string")' \
  <<<"$reviews" >/dev/null || reject "invalid reviews response"

last_force_push="$(api graphql --paginate --slurp -F n="$pr" -f query='
  query($n:Int!, $endCursor:String) {
    repository(owner:"chojona",name:"ImpactFeedAI") {
      pullRequest(number:$n) {
        timelineItems(last:1, itemTypes:[HEAD_REF_FORCE_PUSHED_EVENT]) {
          nodes { ... on HeadRefForcePushedEvent { createdAt } }
        }
        reviewThreads(first:100, after:$endCursor) {
          nodes { isResolved }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }' | json '
    select(type == "array" and length > 0 and all(.[]; (has("errors") | not)))
    | map(.data.repository.pullRequest)
    | select(map(.reviewThreads) | (last | .pageInfo.hasNextPage == false)
      and all(.[]; (.nodes | type == "array" and all(.[]; .isResolved == true))))
    | select(all(.[]; (.timelineItems.nodes | type == "array"
        and all(.[]; (.createdAt | type) == "string"))))
    | [.[].timelineItems.nodes[].createdAt] | max // ""')" \
  || reject "review threads or head force-push history could not be verified"

# A standalone, exact command avoids treating quoted text or a general approval as authorization.
authorization="Authorize merge of PR #$pr at $head"
if ! json 'any(.[]; .user.login == $owner and .user.type == "User" and .body == $authorization
        and (.created_at | type == "string" and . > $last_force_push))' \
      --arg owner "$owner" --arg authorization "$authorization" --arg last_force_push "$last_force_push" <<<"$comments" >/dev/null \
   && ! json '[.[] | select(.user.login == $owner and .user.type == "User"
            and (.state == "APPROVED" or .state == "CHANGES_REQUESTED" or .state == "DISMISSED"))]
            | last | .state == "APPROVED" and .commit_id == $head
            and (.submitted_at | type == "string" and . > $last_force_push)' \
      --arg owner "$owner" --arg head "$head" --arg last_force_push "$last_force_push" <<<"$reviews" >/dev/null; then
  reject "missing explicit authorization from $owner for PR #$pr at $head"
fi

json '[.[] | select(.body | contains("<!-- impactfeed-review -->"))] | last
  | (.body // "" | split("\n")) as $lines
  | [$lines[] | select(startswith("Head:"))] == ["Head: " + $head]
    and [$lines[] | select(startswith("Verdict:"))] == ["Verdict: APPROVE"]' \
  --arg head "$head" <<<"$comments" >/dev/null || reject "missing current approving review attestation"


files="$(pages "$repo/pulls/$pr/files?per_page=100")"
changed_files="$(json '.changed_files | numbers' <<<"$pr_json")"
json 'length == $count and all(.[];
    (.filename | type) == "string" and (.status | type) == "string"
    and (if .status == "renamed" or has("previous_filename")
         then (.previous_filename | type) == "string" else true end))
  and (any(.[] | .filename, (.previous_filename // "");
    test("^(\\.github/|prisma/|docs/orchestration/|\\.agents/|(?:vercel\\.json|package\\.json|CLAUDE\\.md)$)")) | not)' \
  --argjson count "$changed_files" <<<"$files" >/dev/null || reject "protected paths or incomplete PR file list"

check_head
printf 'GATE PASS for PR #%s at %s\n' "$pr" "$head"
