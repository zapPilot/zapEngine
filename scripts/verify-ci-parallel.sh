#!/usr/bin/env bash
# scripts/verify-ci-parallel.sh
#
# Runs every core CI job (ci-jobs.sh) in parallel, then writes the shared
# .ai-verify/result.json + per-job logs (see ci-run-lib.sh). Wired to
# `pnpm verify parallel` — use it to see ALL failures at once instead of the
# stop-at-first-failure sequential gate (verify ci).
#
# Options:
#   --timeout SECONDS   Per-job timeout (default: 0 = disabled)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/ci-run-lib.sh"

cirun_die_if_shallow

# ── CLI ──────────────────────────────────────────────────────────────────────
ITER_TIMEOUT=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --timeout)
      [ "$#" -ge 2 ] || { echo "Error: --timeout requires a value" >&2; exit 64; }
      ITER_TIMEOUT="$2"
      shift 2
      ;;
    --)
      shift
      ;;
    *)
      echo "Error: unknown argument: $1" >&2
      exit 64
      ;;
  esac
done

if ! [[ "$ITER_TIMEOUT" =~ ^[0-9]+$ ]]; then
  echo "Error: --timeout must be a non-negative integer" >&2
  exit 64
fi

# ── Timeout binary ───────────────────────────────────────────────────────────
TIMEOUT_PREFIX=""
if [ "$ITER_TIMEOUT" -gt 0 ]; then
  if command -v timeout >/dev/null 2>&1; then
    TIMEOUT_PREFIX="timeout $ITER_TIMEOUT"
  elif command -v gtimeout >/dev/null 2>&1; then
    TIMEOUT_PREFIX="gtimeout $ITER_TIMEOUT"
  else
    echo "Warning: no timeout/gtimeout in PATH; running without a per-job timeout." >&2
    TIMEOUT_PREFIX=""
  fi
fi

cirun_init

# Optional warmup (CI_WARMUP_COMMAND in ci-jobs.sh): build internal packages
# once so the parallel turbo jobs below hit cache for their `^build` dependency
# instead of each rebuilding packages concurrently (redundant work + dist
# contention on a cold cache). Best-effort: a genuine build break still surfaces
# in type-check/lint. Unset in repos that need no warmup.
if [ -n "${CI_WARMUP_COMMAND:-}" ]; then
  echo "[verify:full:parallel] Warming builds: $CI_WARMUP_COMMAND"
  eval "$CI_WARMUP_COMMAND" > "$CIRUN_LOG_DIR/warmup-build.log" 2>&1 \
    || echo "[verify:full:parallel] warmup had issues (see warmup-build.log); continuing" >&2
fi

echo "[verify:full:parallel] Running full CI checks in parallel..."

# ── Launch jobs ──────────────────────────────────────────────────────────────
declare -a job_ids_arr=()
declare -a job_pids=()

for id in $CORE_CI_JOB_IDS; do
  cmd="$(core_ci_job_command "$id")"
  # Turbo jobs: emit a run summary (.turbo/runs/*.json) so a reader can localize
  # the failing package from a machine-readable source.
  case "$cmd" in
    *"turbo run "*) cmd="$cmd --summarize" ;;
  esac
  log_file="$(cirun_core_log_path "$id")"

  if [ -n "$TIMEOUT_PREFIX" ]; then
    eval "$TIMEOUT_PREFIX $cmd" > "$log_file" 2>&1 &
  else
    eval "$cmd" > "$log_file" 2>&1 &
  fi

  job_ids_arr+=("$id")
  job_pids+=($!)
done

# ── Wait & collect ───────────────────────────────────────────────────────────
any_failed=0

for i in "${!job_ids_arr[@]}"; do
  id="${job_ids_arr[$i]}"
  pid="${job_pids[$i]}"

  set +e
  wait "$pid"
  ec=$?
  set -e

  status="$(cirun_status_from_exit "$ec")"
  cirun_record "$id" "$status" "$ec" ".ai-verify/logs/$(core_ci_job_log "$id")"

  if [ "$ec" -eq 0 ]; then
    echo "[$id] passed"
  else
    echo "[$id] $status -- see $CIRUN_LOG_DIR/$(core_ci_job_log "$id")"
    any_failed=1
  fi
done

cirun_write_result

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "=== Summary ==="
if [ "$any_failed" -eq 0 ]; then
  echo "[verify:full:parallel] ALL PASSED"
else
  echo "[verify:full:parallel] SOME FAILED"
  echo "Check logs in: $CIRUN_LOG_DIR/"
fi

exit "$any_failed"
