#!/usr/bin/env bash
# scripts/resolve-deploy-matrix.test.sh
# Regression lock for resolve-deploy-matrix.sh — covers the 8 event semantics
# from the fleet-converge plan plus full-object shape checks.
#
# Run: bash scripts/resolve-deploy-matrix.test.sh
# CI parity: invoked as a deploy-gates local check (no external deps beyond jq).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/resolve-deploy-matrix.sh"
REGISTRY="$REPO_ROOT/.github/fly-apps.json"

if [ ! -f "$SCRIPT" ]; then
  echo "error: script not found at $SCRIPT" >&2
  exit 1
fi

ALL_JSON=$(jq -c '.' "$REGISTRY")
PODCAST_JSON=$(jq -c --arg t "podcast-pipeline" '[.[] | select(.app == $t)]' "$REGISTRY")
ACCOUNT_PODCAST_JSON=$(jq -c --argjson changes '["account-engine","podcast-pipeline"]' '[.[] | select(.app as $a | $changes | index($a))]' "$REGISTRY")
# verify-only subset (verify_docker==true) for those two
ACCOUNT_PODCAST_VERIFY_JSON=$(jq -c --argjson changes '["account-engine","podcast-pipeline"]' '[.[] | select(.app as $a | $changes | index($a)) | select(.verify_docker)]' "$REGISTRY")
PODCAST_VERIFY_JSON=$(jq -c --arg t "podcast-pipeline" '[.[] | select(.app == $t) | select(.verify_docker)]' "$REGISTRY")

pass=0
fail=0

assert_eq() {
  local label="$1" got="$2" want="$3"
  if [ "$got" = "$want" ]; then
    echo "  ✓ $label"
    pass=$((pass+1))
  else
    echo "  ✗ $label"
    echo "    want: $want"
    echo "     got: $got"
    fail=$((fail+1))
  fi
}

assert_resolve() {
  local label="$1"
  local event="$2"
  local ref="${3:-}"
  local target="${4:-}"
  local changes="${5:-__UNSET__}"
  local want_deploy="$6"
  local want_verify="$7"

  local env_args=()
  env_args+=(EVENT_NAME="$event")
  if [ -n "$ref" ]; then env_args+=(GITHUB_REF="$ref"); else env_args+=(GITHUB_REF=""); fi
  if [ -n "$target" ]; then env_args+=(DEPLOY_TARGET="$target"); else unset_env_target=true; fi
  if [ "$changes" != "__UNSET__" ]; then env_args+=(PATHS_CHANGES="$changes"); fi

  # Build command: need to handle unset DEPLOY_TARGET case
  local out
  local exit_code=0
  if [ "${target:-__EMPTY__}" = "__EMPTY__" ] && [ "$event" != "workflow_dispatch" ]; then
    # For non-dispatch, DEPLOY_TARGET should be unset/empty — pass empty
    if [ "$changes" != "__UNSET__" ]; then
      out=$(EVENT_NAME="$event" GITHUB_REF="$ref" PATHS_CHANGES="$changes" bash "$SCRIPT" 2>/dev/null) || exit_code=$?
    else
      out=$(EVENT_NAME="$event" GITHUB_REF="$ref" bash "$SCRIPT" 2>/dev/null) || exit_code=$?
    fi
  else
    if [ "$changes" != "__UNSET__" ]; then
      out=$(EVENT_NAME="$event" GITHUB_REF="$ref" DEPLOY_TARGET="$target" PATHS_CHANGES="$changes" bash "$SCRIPT" 2>/dev/null) || exit_code=$?
    else
      if [ -n "$target" ]; then
        out=$(EVENT_NAME="$event" GITHUB_REF="$ref" DEPLOY_TARGET="$target" bash "$SCRIPT" 2>/dev/null) || exit_code=$?
      else
        out=$(EVENT_NAME="$event" GITHUB_REF="$ref" bash "$SCRIPT" 2>/dev/null) || exit_code=$?
      fi
    fi
  fi

  if [ "$exit_code" -ne 0 ]; then
    echo "  ✗ $label — script exited $exit_code unexpectedly"
    fail=$((fail+1))
    return
  fi

  local got_deploy got_verify
  got_deploy=$(echo "$out" | grep '^deploy_matrix=' | cut -d= -f2-)
  got_verify=$(echo "$out" | grep '^verify_matrix=' | cut -d= -f2-)

  assert_eq "$label deploy_matrix" "$got_deploy" "$want_deploy"
  assert_eq "$label verify_matrix" "$got_verify" "$want_verify"

  # Shape check: every entry must have full registry fields when non-empty.
  for matrix_var in got_deploy got_verify; do
    local matrix_val
    if [ "$matrix_var" = "got_deploy" ]; then matrix_val="$got_deploy"; else matrix_val="$got_verify"; fi
    if [ "$matrix_val" != "[]" ]; then
      local shape_ok
      shape_ok=$(echo "$matrix_val" | jq -e '[.[] | has("app") and has("fly_config") and has("secret_name") and has("verify_package_script") and has("verify_docker") and has("capture_release_metadata")] | all' 2>/dev/null || echo "false")
      if [ "$shape_ok" = "true" ]; then
        echo "  ✓ $label $matrix_var shape (full registry object)"
        pass=$((pass+1))
      else
        echo "  ✗ $label $matrix_var shape — missing registry fields"
        echo "    matrix: $matrix_val"
        fail=$((fail+1))
      fi
    fi
  done
}

echo "resolve-deploy-matrix.sh regression tests"
echo "registry: $REGISTRY ($(jq length "$REGISTRY") apps)"
echo ""

echo "[1] PR podcast → deploy=[] verify=[podcast]"
assert_resolve "PR podcast" "pull_request" "refs/pull/123/merge" "" '["podcast-pipeline"]' "[]" "$PODCAST_VERIFY_JSON"

echo ""
echo "[2] PR account + podcast → deploy=[] verify=[account,podcast]"
assert_resolve "PR account+podcast" "pull_request" "refs/pull/123/merge" "" '["account-engine","podcast-pipeline"]' "[]" "$ACCOUNT_PODCAST_VERIFY_JSON"

echo ""
echo "[3] PR nothing → deploy=[] verify=[]"
assert_resolve "PR nothing" "pull_request" "refs/pull/123/merge" "" '[]' "[]" "[]"

echo ""
echo "[4] push main + PATHS_CHANGES=[alpha-etl] → deploy=ALL verify=[]"
assert_resolve "push main with changes" "push" "refs/heads/main" "" '["alpha-etl"]' "$ALL_JSON" "[]"

echo ""
echo "[5] push main + PATHS_CHANGES=[] → deploy=ALL verify=[]"
assert_resolve "push main empty" "push" "refs/heads/main" "" '[]' "$ALL_JSON" "[]"

echo ""
echo "[6] push non-main → deploy=[] verify=[]"
assert_resolve "push non-main" "push" "refs/heads/feature-x" "" '["alpha-etl"]' "[]" "[]"
# also test without PATHS_CHANGES noise
assert_resolve "push non-main empty changes" "push" "refs/heads/feature-x" "" '[]' "[]" "[]"
# push on a tag-like ref should also be empty
assert_resolve "push tag ref" "push" "refs/tags/v1.0.0" "" '[]' "[]" "[]"

echo ""
echo "[7] workflow_dispatch all → deploy=ALL"
assert_resolve "dispatch all" "workflow_dispatch" "" "all" "__UNSET__" "$ALL_JSON" "[]"

echo ""
echo "[8] workflow_dispatch podcast → deploy=[podcast]"
assert_resolve "dispatch podcast" "workflow_dispatch" "" "podcast-pipeline" "__UNSET__" "$PODCAST_JSON" "[]"

echo ""
echo "[9] workflow_dispatch typo → exit 1"
set +e
EVENT_NAME=workflow_dispatch DEPLOY_TARGET=typo bash "$SCRIPT" >/dev/null 2>&1
code=$?
set -e
if [ "$code" -eq 1 ]; then
  echo "  ✓ dispatch typo exit 1"
  pass=$((pass+1))
else
  echo "  ✗ dispatch typo — expected exit 1, got $code"
  fail=$((fail+1))
fi

# Additional shape: dispatch all entries must have all 6 keys (already checked above)
# Extra: PR verify_matrix must be subset of ALL where verify_docker true
echo ""
echo "[10] verify_matrix ⊆ verify_docker true"
out=$(EVENT_NAME=pull_request GITHUB_REF=refs/pull/1/merge PATHS_CHANGES='["account-engine","analytics-engine","podcast-pipeline","alpha-etl"]' bash "$SCRIPT" 2>/dev/null)
got_verify=$(echo "$out" | grep '^verify_matrix=' | cut -d= -f2-)
# analytics-engine has verify_docker:false, so should be excluded
want_all_verify_true=$(jq -c '[.[] | select(.verify_docker)]' "$REGISTRY")
if [ "$got_verify" = "$want_all_verify_true" ]; then
  echo "  ✓ PR all-apps verify only docker=true (analytics excluded)"
  pass=$((pass+1))
else
  echo "  ✗ PR all-apps verify subset mismatch"
  echo "    want: $want_all_verify_true"
  echo "     got: $got_verify"
  fail=$((fail+1))
fi

# Also ensure pull_request never produces deploy_matrix non-empty even if PATHS_CHANGES covers all
echo ""
echo "[11] PR never deploys even when all changed"
out=$(EVENT_NAME=pull_request GITHUB_REF=refs/pull/1/merge PATHS_CHANGES='["account-engine","alpha-etl","analytics-engine","podcast-pipeline"]' bash "$SCRIPT" 2>/dev/null)
got_deploy=$(echo "$out" | grep '^deploy_matrix=' | cut -d= -f2-)
assert_eq "PR all changed deploy empty" "$got_deploy" "[]"

echo ""
echo "—"
echo "passed: $pass, failed: $fail"
if [ "$fail" -ne 0 ]; then
  exit 1
fi
echo "all resolve-deploy-matrix tests passed"
