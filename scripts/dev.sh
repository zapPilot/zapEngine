#!/usr/bin/env bash
# Dispatcher for `pnpm dev [sub]`. Curated turbo dev stacks.
# Bare `pnpm dev` = the daily product stack.
set -euo pipefail

flags=(--cache=local:rw --ui=stream --no-update-notifier)

case "${1:-}" in
  "")        exec turbo run dev "${flags[@]}" --filter=@zapengine/frontend --filter=@zapengine/account-engine --filter=@zapengine/analytics-engine --filter=@zapengine/types --filter=@zapengine/intent-engine ;;
  lite)      exec turbo run dev "${flags[@]}" --filter=@zapengine/frontend --filter=@zapengine/account-engine --filter=@zapengine/types --filter=@zapengine/intent-engine ;;
  api)       exec turbo run dev "${flags[@]}" --filter=@zapengine/account-engine --filter=@zapengine/types --filter=@zapengine/intent-engine ;;
  frontend)  exec turbo run dev "${flags[@]}" --filter=@zapengine/frontend --filter=@zapengine/types --filter=@zapengine/intent-engine ;;
  landing)   exec turbo run dev "${flags[@]}" --filter=@zapengine/landing-page ;;
  analytics) exec turbo run dev "${flags[@]}" --filter=@zapengine/analytics-engine ;;
  all)       exec turbo run dev "${flags[@]}" ;;
  *) echo "usage: pnpm dev [lite|api|frontend|landing|analytics|all]" >&2; exit 2 ;;
esac
