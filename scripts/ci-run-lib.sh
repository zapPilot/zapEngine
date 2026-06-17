#!/usr/bin/env bash
# scripts/ci-run-lib.sh
#
# Shared helpers for the verify-*.sh family. One place owns the .ai-verify
# layout, runs a job into its own log, and writes the machine-readable
# .ai-verify/result.json that agents (e.g. OpenCode `/goal`) read to locate a
# failure. Source this file; do not execute it.
#
# Contract — EVERY verify variant emits the same two things:
#   .ai-verify/result.json      { schemaVersion, status, jobs[{id,status,exitCode,log}] }
#   .ai-verify/logs/<id>.log    one combined-output log per recorded job
#
# Core gates (verify ci / parallel) record the 9 jobs from ci-jobs.sh, one log
# each. Affected gates (verify changed / staged / branch) record a single
# aggregate entry whose log holds the turbo run; turbo `--summarize` then lets a
# reader localize the failing package#task from .turbo/runs/*.json.

# Repo paths from this file's location (scripts/ -> repo root).
_CIRUN_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CIRUN_ROOT_DIR="$(cd "$_CIRUN_LIB_DIR/.." && pwd)"
CIRUN_LOG_DIR="$CIRUN_ROOT_DIR/.ai-verify/logs"
CIRUN_RESULT_JSON="$CIRUN_ROOT_DIR/.ai-verify/result.json"

# Job registry: CORE_CI_JOB_IDS, core_ci_job_command/name/log, CI_WARMUP_COMMAND.
# shellcheck source=scripts/ci-jobs.sh
[ -n "${CORE_CI_JOB_IDS:-}" ] || source "$_CIRUN_LIB_DIR/ci-jobs.sh"

# Result accumulators, kept in lock-step by index.
_cirun_ids=()
_cirun_statuses=()
_cirun_exits=()
_cirun_logs=()

# verify:* gates need full history (turbo --affected, git ranges); bail early
# with the fix hint instead of producing confusing partial output.
cirun_die_if_shallow() {
  if git rev-parse --is-shallow-repository 2>/dev/null | grep -q true; then
    echo "❌ Shallow clone detected. Run: git fetch --unshallow origin" >&2
    exit 1
  fi
}

# Fresh log dir + result.json, empty accumulators, and drop stale turbo run
# summaries so a reader only ever sees the current round.
cirun_init() {
  mkdir -p "$CIRUN_LOG_DIR"
  rm -f "$CIRUN_RESULT_JSON" "$CIRUN_RESULT_JSON.tmp"
  rm -rf "$CIRUN_ROOT_DIR/.turbo/runs"
  _cirun_ids=()
  _cirun_statuses=()
  _cirun_exits=()
  _cirun_logs=()
}

# cirun_core_log_path <id>: absolute log path for a core job (via ci-jobs.sh).
cirun_core_log_path() {
  echo "$CIRUN_LOG_DIR/$(core_ci_job_log "$1")"
}

# cirun_status_from_exit <exitCode>: 0 passed, 124 timed_out (timeout(1)), else failed.
cirun_status_from_exit() {
  if [ "$1" -eq 0 ]; then echo "passed"
  elif [ "$1" -eq 124 ]; then echo "timed_out"
  else echo "failed"; fi
}

# cirun_record <id> <status> <exitCode> <logRelPath>: append one job result.
cirun_record() {
  _cirun_ids+=("$1")
  _cirun_statuses+=("$2")
  _cirun_exits+=("$3")
  _cirun_logs+=("$4")
}

# cirun_run_core_job <id>: run a core CI job sequentially, tee combined output
# to its own log (so console AND log get it), record the result, return its
# exit code. Use in the sequential gate; the parallel gate launches its own
# background jobs and calls cirun_record directly.
cirun_run_core_job() {
  local id="$1" cmd log_file ec
  cmd="$(core_ci_job_command "$id")"
  log_file="$(cirun_core_log_path "$id")"

  set +e
  eval "$cmd" 2>&1 | tee "$log_file"
  ec="${PIPESTATUS[0]}"
  set -e

  cirun_record "$id" "$(cirun_status_from_exit "$ec")" "$ec" ".ai-verify/logs/$(core_ci_job_log "$id")"
  return "$ec"
}

# cirun_write_result: emit .ai-verify/result.json atomically from accumulators.
# Overall status is failed if any recorded job had a non-zero exit.
cirun_write_result() {
  local tmp="$CIRUN_RESULT_JSON.tmp" overall="passed" i
  for i in "${!_cirun_exits[@]}"; do
    [ "${_cirun_exits[$i]}" -eq 0 ] || overall="failed"
  done

  {
    printf '{\n'
    printf '  "schemaVersion": 1,\n'
    printf '  "status": "%s",\n' "$overall"
    printf '  "jobs": [\n'
    for i in "${!_cirun_ids[@]}"; do
      [ "$i" -gt 0 ] && printf ',\n'
      printf '    { "id": "%s", "status": "%s", "exitCode": %d, "log": "%s" }' \
        "${_cirun_ids[$i]}" "${_cirun_statuses[$i]}" "${_cirun_exits[$i]}" "${_cirun_logs[$i]}"
    done
    printf '\n  ]\n'
    printf '}\n'
  } > "$tmp"

  mv "$tmp" "$CIRUN_RESULT_JSON"
}
