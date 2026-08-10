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

# Sourced after load_repo_env so ACCOUNT_ENGINE_PORT and friends are exported
# before the port table is built from them.
# shellcheck source=scripts/dev-ports-lib.sh
source "$repo_root/scripts/dev-ports-lib.sh"

flags=(--cache=local:rw --ui=stream --no-update-notifier)

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
