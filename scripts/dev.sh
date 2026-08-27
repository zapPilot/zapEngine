#!/usr/bin/env bash
# Dispatcher for `pnpm dev [sub]`. Curated turbo dev stacks.
# Bare `pnpm dev` = the daily product stack (universal app web + APIs).
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$repo_root"
# The root package script loads canonical .env values and client projections
# before this dispatcher starts, so Turbo sees them while computing task hashes.
# Sourced here so ACCOUNT_ENGINE_PORT and friends are available to the port table.
# shellcheck source=scripts/dev-ports-lib.sh
source "$repo_root/scripts/dev-ports-lib.sh"

# `scripts/env/run.mjs` is the canonical env boundary. Turbo strict mode would
# otherwise drop server-only values (for example SUPABASE_URL) before service
# dev tasks start, even though the runner loaded them successfully.
flags=(--cache=local:rw --ui=stream --no-update-notifier --env-mode=loose)

usage() {
  echo "usage: pnpm dev [web|app|api|landing|analytics|all|stop]" >&2
  exit 2
}

sub="${1:-}"

# Validate before touching any process — dev_ports_for rejects what it has no
# port table for.
dev_ports_for "$sub" > /dev/null || usage

# Free the ports this stack binds, so a dev server whose terminal is long gone
# cannot keep answering on 8081 while turbo reports a healthy start.
if [ "$sub" = "stop" ]; then
  dev_preflight_ports stop --force || exit 1
  echo "✅ dev ports released"
  exit 0
fi
dev_preflight_ports "$sub" || exit 1

case "$sub" in
  "")        exec turbo run @zapengine/app#dev:web @zapengine/app-core#dev @zapengine/account-engine#dev @zapengine/analytics-engine#dev @zapengine/types#dev @zapengine/intent-engine#dev "${flags[@]}" ;;
  web)       exec turbo run @zapengine/app#dev:web @zapengine/app-core#dev @zapengine/types#dev @zapengine/intent-engine#dev "${flags[@]}" ;;
  app)       exec turbo run dev "${flags[@]}" --filter=@zapengine/app --filter=@zapengine/app-core --filter=@zapengine/types --filter=@zapengine/intent-engine ;;
  api)       exec turbo run dev "${flags[@]}" --filter=@zapengine/account-engine --filter=@zapengine/types --filter=@zapengine/intent-engine ;;
  landing)   exec turbo run dev "${flags[@]}" --filter=@zapengine/landing-page ;;
  analytics) exec turbo run dev "${flags[@]}" --filter=@zapengine/analytics-engine ;;
  all)       exec turbo run dev "${flags[@]}" ;;
  *) usage ;;
esac
