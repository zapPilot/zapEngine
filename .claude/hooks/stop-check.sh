#!/usr/bin/env bash
# Stop hook: run `pnpm verify` before letting Claude end its turn.
# Skips when the working tree is clean or SKIP_STOP_CHECK=1.
# On failure: returns a JSON "block" decision so Claude must fix and retry.
# Degrades to a warning if Claude already retried once (stop_hook_active=true).

set -u
set -o pipefail

# --- Escape hatch -----------------------------------------------------------
if [ "${SKIP_STOP_CHECK:-}" = "1" ]; then
  exit 0
fi

# --- Read hook input from stdin --------------------------------------------
input=$(cat)

# Parse stop_hook_active (true if Claude already retried after a previous block).
stop_hook_active=$(printf '%s' "$input" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    print("true" if data.get("stop_hook_active") else "false")
except Exception:
    print("false")
')

# --- Locate project root ----------------------------------------------------
project_dir="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$project_dir" || exit 0

# Keep non-interactive hooks on the pnpm version declared by packageManager.
if command -v corepack >/dev/null 2>&1; then
  corepack_bin_dir="${COREPACK_SHIM_DIR:-${TMPDIR:-/tmp}/zapengine-corepack-bin}"
  mkdir -p "$corepack_bin_dir"
  if corepack enable --install-directory "$corepack_bin_dir" >/dev/null 2>&1; then
    PATH="$corepack_bin_dir:$PATH"
  fi
fi

# --- Skip when working tree is clean ---------------------------------------
if [ -z "$(git status --porcelain 2>/dev/null)" ]; then
  exit 0
fi

# --- Run the gate ----------------------------------------------------------
log_file=$(mktemp -t stop-check.XXXXXX)
trap 'rm -f "$log_file"' EXIT

emit_failure() {
  title="$1"
  bypass="$2"
  tail_output=$(tail -n 80 "$log_file")

  reason=$(
    printf '%s\n%s\n\n%s' \
      "$title Tail of output (last 80 lines):" \
      "$tail_output" \
      "Fix the failures and try to stop again. Set $bypass to bypass." \
    | python3 -c 'import json, sys; print(json.dumps(sys.stdin.read()))'
  )

  if [ "$stop_hook_active" = "true" ]; then
    # Anti-loop: warn only, do not block again.
    printf '{"systemMessage": %s}\n' "$reason"
  else
    printf '{"decision":"block","reason":%s,"systemMessage":%s}\n' "$reason" "$reason"
  fi
}

if ! pnpm verify >"$log_file" 2>&1; then
  emit_failure "pnpm verify failed." "SKIP_STOP_CHECK=1"
  exit 0
fi

if [ "${SKIP_VITE_HEALTH_CHECK:-}" != "1" ]; then
  : >"$log_file"
  if ! pnpm --filter @zapengine/frontend run dev:health -- --allow-missing-browser >"$log_file" 2>&1; then
    emit_failure "Vite dev health check failed." "SKIP_VITE_HEALTH_CHECK=1"
    exit 0
  fi
fi

exit 0
