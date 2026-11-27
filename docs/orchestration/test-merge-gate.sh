#!/usr/bin/env bash
set -euo pipefail

gate="$(cd "$(dirname "$0")" && pwd)/merge-gate.sh"
mock_dir="$(mktemp -d)"
trap 'rm -rf "$mock_dir"' EXIT
export PATH="$mock_dir:$PATH"
export MOCK_DIR="$mock_dir"

cat > "$mock_dir/gh" <<'MOCK'
#!/usr/bin/env bash
set -eu
[[ "$1 $2 $3" == "api --hostname github.com" ]]
head=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
old=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
date=2026-11-27T18:00:00Z
attest="<!-- impactfeed-review -->\nHead: $head\nVerdict: APPROVE"
case "$4" in
  repos/chojona/ImpactFeedAI/pulls/36)
    [[ "$CASE" != api-error ]] || exit 1
    if [[ "$CASE" == malformed-json ]]; then printf '{"number":36} invalid\n'; exit 0; fi
    printf '{"number":36,"state":"open","draft":false,"mergeable":true,"labels":[],"changed_files":1,"head":{"sha":"%s","ref":"topic","repo":{"full_name":"chojona/ImpactFeedAI"}}}\n' "$head"
    ;;
  repos/chojona/ImpactFeedAI/git/ref/heads/topic)
    if [[ "$CASE" == new-push && -f "$MOCK_DIR/ref-read" ]]; then head="$old"; fi
    touch "$MOCK_DIR/ref-read"
    printf '{"object":{"sha":"%s"}}\n' "$head"
    ;;
  "repos/chojona/ImpactFeedAI/compare/main...$head") printf '{"behind_by":0}\n' ;;
  "repos/chojona/ImpactFeedAI/commits/$head/check-runs?per_page=100")
    printf '[{"check_runs":[{"name":"Quality checks","app":{"id":15368},"conclusion":"success","head_sha":"%s"}]}]\n' "$head"
    ;;
  "repos/chojona/ImpactFeedAI/issues/36/comments?per_page=100")
    [[ "$CASE" != timeout ]] || exit 124
    author=chojona
    pr=36
    sha="$head"
    case "$CASE" in
      other-comment) author=collaborator ;;
      wrong-pr) pr=35 ;;
      old-comment) sha="$old" ;;
    esac
    case "$CASE" in
      owner-comment|other-comment|wrong-pr|old-comment)
        extra="{\"user\":{\"login\":\"$author\",\"type\":\"User\"},\"created_at\":\"$date\",\"body\":\"Authorize merge of PR #$pr at $sha\"}"
        ;;
      *) extra= ;;
    esac
    printf '[[{"user":{"login":"reviewer","type":"User"},"body":"%s"}]]\n' "$attest" | jq --argjson extra "[$extra]" '.[0] += $extra'
    ;;
  "repos/chojona/ImpactFeedAI/pulls/36/reviews?per_page=100")
    author=chojona
    type=User
    case "$CASE" in
      *-comment|wrong-pr) printf '[[]]\n'; exit 0 ;;
      other-review) author=collaborator ;;
      bot-review) type=Bot ;;
      old-review) head="$old" ;;
    esac
    printf '[[{"user":{"login":"%s","type":"%s"},"state":"APPROVED","submitted_at":"%s","commit_id":"%s"}]]\n' "$author" "$type" "$date" "$head"
    ;;
  graphql)
    nodes='[]'
    if [[ "$CASE" == restored-head ]]; then nodes='[{"createdAt":"2026-11-27T18:01:00Z"}]'; fi
    if [[ "$CASE" == graphql-error ]]; then printf '[{"errors":[{"message":"timeout"}]}]\n'; exit 0; fi
    printf '[{"data":{"repository":{"pullRequest":{"reviewThreads":{"nodes":[],"pageInfo":{"hasNextPage":false}},"timelineItems":{"nodes":%s}}}}}]\n' "$nodes"
    ;;
  "repos/chojona/ImpactFeedAI/pulls/36/files?per_page=100")
    case "$CASE" in
      rename-into-protected) printf '[[{"filename":".github/ci.yml","previous_filename":"src/ci.yml","status":"renamed"}]]\n' ;;
      rename-out-of-protected) printf '[[{"filename":"src/ci.yml","previous_filename":".github/ci.yml","status":"renamed"}]]\n' ;;
      package-json) printf '[[{"filename":"package.json","status":"modified"}]]\n' ;;
      claude-md) printf '[[{"filename":"CLAUDE.md","status":"modified"}]]\n' ;;
      agents) printf '[[{"filename":".agents/skills/example/SKILL.md","status":"modified"}]]\n' ;;
      *) printf '[[{"filename":"src/example.ts","status":"modified"}]]\n' ;;
    esac
    ;;
  *) printf 'Unexpected gh call: %s\n' "$*" >&2; exit 99 ;;
esac
MOCK
chmod +x "$mock_dir/gh"

check() {
  local name="$1" expected="$2" output status=0 verdict=FAIL
  shift 2
  rm -f "$mock_dir/ref-read"
  output="$(CASE="$name" bash "$gate" 36 "$@" 2>&1)" || status=$?
  [[ "$expected" != PASS ]] || verdict=PASS
  if [[ "$expected" == PASS && "$status" == 0 && "$output" == GATE\ PASS* ]] ||
     [[ "$expected" != PASS && "$status" != 0 && "$output" == *"GATE FAIL: $expected"* && "$output" != *Unexpected\ gh\ call* ]]; then
    printf 'ok - %s (%s)\n' "$name" "$verdict"
  else
    printf 'not ok - %s (expected %s, exit %s)\n%s\n' "$name" "$expected" "$status" "$output" >&2
    exit 1
  fi
}

check owner-review PASS
check owner-comment PASS
for name in other-review bot-review old-review restored-head other-comment wrong-pr old-comment; do
  check "$name" "missing explicit authorization"
done
check new-push "head changed"
check api-error "API, JSON, or command error"
check timeout "API, JSON, or command error"
check malformed-json "API, JSON, or command error"
check graphql-error "review threads or head force-push history could not be verified"
for name in rename-into-protected rename-out-of-protected package-json claude-md agents; do
  check "$name" "protected paths"
done
check legacy-merge-flag "usage:" --merge
