#!/usr/bin/env bash
# Dispatcher for `pnpm dev [sub]`. Curated turbo dev stacks.
# Bare `pnpm dev` = the daily product stack (universal app web + APIs).
set -euo pipefail

flags=(--cache=local:rw --ui=stream --no-update-notifier)

case "${1:-}" in
  "")        exec turbo run @zapengine/app#dev:web @zapengine/account-engine#dev @zapengine/analytics-engine#dev @zapengine/types#dev @zapengine/intent-engine#dev "${flags[@]}" ;;
  web)       exec turbo run dev:web "${flags[@]}" --filter=@zapengine/app ;;
  app)       exec turbo run dev "${flags[@]}" --filter=@zapengine/app --filter=@zapengine/types --filter=@zapengine/intent-engine ;;
  api)       exec turbo run dev "${flags[@]}" --filter=@zapengine/account-engine --filter=@zapengine/types --filter=@zapengine/intent-engine ;;
  landing)   exec turbo run dev "${flags[@]}" --filter=@zapengine/landing-page ;;
  analytics) exec turbo run dev "${flags[@]}" --filter=@zapengine/analytics-engine ;;
  all)       exec turbo run dev "${flags[@]}" ;;
  *) echo "usage: pnpm dev [web|app|api|landing|analytics|all]" >&2; exit 2 ;;
esac
