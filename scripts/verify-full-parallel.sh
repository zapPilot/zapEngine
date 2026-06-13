#!/usr/bin/env bash
set -euo pipefail

if git rev-parse --is-shallow-repository 2>/dev/null | grep -q true; then
  echo "❌ Shallow clone detected. Run: git fetch --unshallow origin"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$ROOT_DIR/.ai-verify/logs"

mkdir -p "$LOG_DIR"

echo "[verify:full:parallel] Running full CI checks in parallel..."

pnpm format:check:core > "$LOG_DIR/format.log" 2>&1 &
pid_format=$!

pnpm lint:repo > "$LOG_DIR/repo.log" 2>&1 &
pid_repo=$!

pnpm contracts:check > "$LOG_DIR/contracts.log" 2>&1 &
pid_contracts=$!

pnpm turbo run lint type-check deadcode dup:check test:ci \
  --filter='!@zapengine/mobile' \
  > "$LOG_DIR/turbo.log" 2>&1 &
pid_turbo=$!

pnpm turbo run sql:audit service-reachability pylint:duplicate-check \
  --filter=@zapengine/analytics-engine \
  > "$LOG_DIR/analytics.log" 2>&1 &
pid_analytics=$!

failed=0

for name_pid in \
  "format:$pid_format" \
  "repo:$pid_repo" \
  "contracts:$pid_contracts" \
  "turbo:$pid_turbo" \
  "analytics:$pid_analytics"
do
  name="${name_pid%%:*}"
  pid="${name_pid##*:}"

  if wait "$pid"; then
    echo "[$name] ✅ passed"
  else
    echo "[$name] ❌ failed — see $LOG_DIR/$name.log"
    failed=1
  fi
done

echo ""
echo "=== Summary ==="
if [ $failed -eq 0 ]; then
  echo "[verify:full:parallel] ✅ ALL PASSED"
else
  echo "[verify:full:parallel] ❌ SOME FAILED"
  echo "Check logs in: $LOG_DIR/"
fi

exit "$failed"