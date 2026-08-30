#!/usr/bin/env bash
# scripts/verify-affected.sh <changed|branch>
#
# Diff-scoped gate: runs turbo --affected over one of two diff ranges.
#
#   changed  Fast inner loop. lint/type-check/test/e2e/deadcode/dup on packages
#            affected by committed + staged + working-tree changes (a synthetic
#            WIP commit feeds turbo --affected). Wired to `pnpm verify changed`.
#   branch   Pre-push gate. lint/type-check on packages affected by
#            origin/main...HEAD. Wired to `pnpm verify branch`.
#
# Both modes write the shared .ai-verify/result.json plus a single aggregate log
# .ai-verify/logs/verify-<mode>.log (see ci-run-lib.sh); turbo --summarize drops
# .turbo/runs/*.json so a reader can localize the failing package#task.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/ci-run-lib.sh"

mode="${1:-}"
case "$mode" in
  changed | branch) shift ;;
  *)
    echo "usage: scripts/verify-affected.sh <changed|branch>" >&2
    exit 64
    ;;
esac

[ "$#" -eq 0 ] || {
  echo "Error: unknown argument: $1" >&2
  exit 64
}

cirun_die_if_shallow
cirun_init

tasks=(lint type-check)

if [ "$mode" = "changed" ]; then
  echo "[verify:changed] Checking committed + staged + working tree changes"

  # turbo --affected only reads commits, so stage everything (including
  # untracked) into a throwaway index and build a commit object off HEAD that is
  # never referenced by any ref — the real index and working tree are untouched.
  head_ref=$(git rev-parse HEAD)
  tmp_index="$(mktemp)"
  cp .git/index "$tmp_index"

  GIT_INDEX_FILE="$tmp_index" git add -A

  tree="$(GIT_INDEX_FILE="$tmp_index" git write-tree 2>/dev/null)"
  scm_head="$(printf "verify:changed synthetic WIP\n" | GIT_INDEX_FILE="$tmp_index" git commit-tree "$tree" -p "$head_ref" 2>/dev/null)"

  rm -f "$tmp_index"

  echo "[verify:changed] Synthetic WIP commit: $scm_head"

  tasks+=(test test:e2e deadcode dup:check)
else
  echo "[verify:branch] Checking committed changes: origin/main...HEAD"
  scm_head="HEAD"
fi

log_base="verify-$mode.log"
log_file="$CIRUN_LOG_DIR/$log_base"

status=0
cirun_run_logged "$mode" "$log_base" \
  env TURBO_SCM_BASE="origin/main" TURBO_SCM_HEAD="$scm_head" \
  pnpm turbo run "${tasks[@]}" \
  --affected \
  --summarize || status=$?
cirun_write_result

if [ "$status" -eq 0 ]; then
  echo "[verify:$mode] ✅ PASSED"
else
  echo "[verify:$mode] ❌ FAILED (turbo exit $status)"
  echo "Last 120 lines of $log_file:"
  echo "------------------------------------------------------------"
  tail -n 120 "$log_file"
  echo "See result: $CIRUN_RESULT_JSON"
fi

exit "$status"
