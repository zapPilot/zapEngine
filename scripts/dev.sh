#!/usr/bin/env bash
# Dispatcher for `pnpm dev [sub]`. Curated turbo dev stacks.
# Bare `pnpm dev` = the daily product stack (universal app web + APIs).
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

load_repo_env() {
  local env_file="$repo_root/.env"
  local line key value

  [ -f "$env_file" ] || return 0

  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"

    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]] || continue

    key="${BASH_REMATCH[2]}"
    value="${BASH_REMATCH[3]}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"

    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi

    if [[ -z "${!key+x}" ]]; then
      export "$key=$value"
    fi
  done < "$env_file"
}

cd "$repo_root"
load_repo_env

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
