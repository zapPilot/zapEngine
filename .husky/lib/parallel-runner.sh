# Reusable POSIX sh parallel task runner.
#
# Callers source this file and use:
#   init_parallel_runner          # reset state, create tmp log dir
#   queue_task <name> <cmd>       # launch cmd in background with [name] prefix
#   ...                           # more queue_task calls
#   wait_tasks                    # wait for all, return 1 if any failed
#   phase <label>                 # emit ::phase:: sentinel for parent to track
#
# The [name] prefix on each line and the ::phase:: sentinel are parsed by a
# parent invocation of this runner (when nested), so the orchestrator's phase
# tracking and log tails work across layers.

phase() {
  printf '::phase::%s\n' "$1"
}

init_parallel_runner() {
  PR_LOG_DIR=$(mktemp -d)
  PR_PIDS=""
  PR_NAMES=""
  PR_ALL_DIRS="${PR_ALL_DIRS:-} $PR_LOG_DIR"
  if [ -z "${PR_TRAP_SET:-}" ]; then
    trap '_pr_cleanup' EXIT
    PR_TRAP_SET=1
  fi
}

_pr_cleanup() {
  for d in ${PR_ALL_DIRS:-}; do
    rm -rf "$d" 2>/dev/null || true
  done
}

queue_task() {
  name=$1
  cmd=$2
  log_file="$PR_LOG_DIR/$name.log"
  phase_file="$PR_LOG_DIR/$name.phase"
  rc_file="$PR_LOG_DIR/$name.rc"

  printf '[%s] starting\n' "$name"

  (
    (
      set +e
      sh -c "$cmd"
      rc=$?
      printf '%s\n' "$rc" >"$rc_file"
      exit 0
    ) 2>&1 | tee "$log_file" | while IFS= read -r line || [ -n "$line" ]; do
      case "$line" in
        "::phase::"*)
          printf '%s\n' "${line#::phase::}" >"$phase_file"
          ;;
        *)
          printf '[%s] %s\n' "$name" "$line"
          ;;
      esac
    done
  ) &

  PR_PIDS="$PR_PIDS $!"
  PR_NAMES="$PR_NAMES $name"
}

_pr_extract_failed_hook() {
  log_file=$1
  [ -f "$log_file" ] || return 0
  awk '
    /^[^[:space:]].*Failed$/ {
      line = $0
      sub(/[.][.][.].*$/, "", line)
      if (length(line) > 0) {
        print line
        exit
      }
    }
  ' "$log_file"
}

_pr_resolve_failure_phase() {
  name=$1
  phase_file="$PR_LOG_DIR/$name.phase"
  log_file="$PR_LOG_DIR/$name.log"

  if [ -s "$phase_file" ]; then
    cat "$phase_file"
    return
  fi

  phase=$(_pr_extract_failed_hook "$log_file")
  if [ -n "$phase" ]; then
    printf '%s\n' "$phase"
    return
  fi

  # Fallback: task name itself. Always at least as informative as "unknown".
  printf '%s\n' "$name"
}

_pr_print_failure_tail() {
  name=$1
  log_file="$PR_LOG_DIR/$name.log"

  if [ ! -f "$log_file" ]; then
    printf '   (no output captured)\n'
    return
  fi

  tail_output=$(sed '/^::phase::/d' "$log_file" | tail -n 20)

  if [ -z "$tail_output" ]; then
    printf '   (no output captured)\n'
    return
  fi

  printf '%s\n' "$tail_output" | sed 's/^/   /'
}

wait_tasks() {
  for pid in $PR_PIDS; do
    wait "$pid" || true
  done

  FAILED=""
  for n in $PR_NAMES; do
    rc=$(cat "$PR_LOG_DIR/$n.rc" 2>/dev/null || echo 99)
    if [ "$rc" != "0" ]; then
      FAILED="$FAILED $n"
    fi
  done

  if [ -n "$FAILED" ]; then
    printf '\n❌ Failed:\n'
    for n in $FAILED; do
      phase=$(_pr_resolve_failure_phase "$n")
      printf '   %-16s → phase: %s\n' "$n" "$phase"
    done
    for n in $FAILED; do
      printf '\n--- %s (last 20 lines) ---\n' "$n"
      _pr_print_failure_tail "$n"
    done
    return 1
  fi

  return 0
}
