#!/usr/bin/env bash
# Stop hook: run `pnpm check:local` before letting Claude end its turn.
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

# --- Skip when working tree is clean ---------------------------------------
if [ -z "$(git status --porcelain 2>/dev/null)" ]; then
  exit 0
fi

# --- Run the gate ----------------------------------------------------------
log_file=$(mktemp -t stop-check.XXXXXX)
trap 'rm -f "$log_file"' EXIT

if pnpm check:local >"$log_file" 2>&1; then
  exit 0
fi

# --- Failure: build a JSON response ----------------------------------------
tail_output=$(tail -n 80 "$log_file")

reason=$(
  printf '%s\n%s\n\n%s' \
    "pnpm check:local failed. Tail of output (last 80 lines):" \
    "$tail_output" \
    "Fix the failures and try to stop again. Set SKIP_STOP_CHECK=1 to bypass." \
  | python3 -c 'import json, sys; print(json.dumps(sys.stdin.read()))'
)

if [ "$stop_hook_active" = "true" ]; then
  # Anti-loop: warn only, do not block again.
  printf '{"systemMessage": %s}\n' "$reason"
else
  printf '{"decision":"block","reason":%s,"systemMessage":%s}\n' "$reason" "$reason"
fi

exit 0
