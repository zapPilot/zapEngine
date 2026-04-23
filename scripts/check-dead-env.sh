#!/usr/bin/env bash
# scripts/check-dead-env.sh
#
# Detects environment variables declared in root .env.example that are never
# referenced in any app's source code.
#
# Supports all apps in this monorepo:
#   - TypeScript / Node.js  (account-engine, alpha-etl)
#   - Vite / React          (frontend)
#   - Next.js               (landing-page)
#   - Python / Pydantic     (analytics-engine)
#
# Usage:
#   bash scripts/check-dead-env.sh            # check all apps
#   bash scripts/check-dead-env.sh frontend   # check specific app only

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APPS_DIR="$REPO_ROOT/apps"
ENV_FILE="$REPO_ROOT/.env.example"

# ── ANSI colours ────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

found_dead=0

# ── Helper: check if var exists in any app's source ─────────────────────────
# var_in_apps <var-name> returns list of apps that reference the var
check_var_in_apps() {
  local var="$1"
  local found_in=()

  # Check each app's source
  for entry in "${APP_REGISTRY[@]}"; do
    IFS='|' read -r app_name src_subdir exts <<< "$entry"
    local src_dir="$APPS_DIR/$app_name/$src_subdir"

    # Skip if src dir doesn't exist
    [ -d "$src_dir" ] || continue

    # Build include args for this app's extensions
    local include_args=()
    for ext in $exts; do
      include_args+=("--include=*.$ext")
    done

    # Check if var exists in this app's source
    if grep -rqw "$var" "${include_args[@]}" "$src_dir" 2>/dev/null; then
      found_in+=("$app_name")
    fi
  done

  if [ ${#found_in[@]} -gt 0 ]; then
    printf "%s" "${found_in[*]}"
    return 0
  fi
  return 1
}

# ── App registry ─────────────────────────────────────────────────────────────
# Each entry: "app-name|src-subdir|ext1 ext2 ..."
declare -a APP_REGISTRY=(
  "account-engine|src|ts"
  "alpha-etl|src|ts"
  "frontend|src|ts tsx"
  "landing-page|src|ts tsx"
  "analytics-engine|src|py"
)

# ── Filter to requested app (if any) ─────────────────────────────────────────
FILTER="${1:-}"

# ── Main check ───────────────────────────────────────────────────────────────
printf "\n${BOLD}Checking root .env.example for dead env vars...${RESET}\n\n"

# ── guard: root .env.example must exist ─────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  printf "${RED}✗${RESET} Root .env.example not found at: %s\n" "$ENV_FILE"
  exit 1
fi

# ── parse declared env var names ────────────────────────────────────────────
# Keep only non-comment lines that start with KEY= (all-caps + underscore).
declared_vars=$(
  grep -E '^[A-Z_][A-Z0-9_]*=' "$ENV_FILE" \
    | sed 's/=.*//' \
    | sort -u
)

if [ -z "$declared_vars" ]; then
  printf "${YELLOW}No env vars declared in .env.example${RESET}\n"
  exit 0
fi

# ── check each var ───────────────────────────────────────────────────────────
dead_vars=()
live_vars=()

while IFS= read -r var; do
  # If filtering to a specific app, only check vars that look like they belong
  # (prefix matching or context clues)
  if [ -n "$FILTER" ]; then
    # Check if this var is likely app-specific and doesn't match filter
    case "$var" in
      VITE_*)
        [[ "$FILTER" == "frontend" ]] || continue
        ;;
      ACCOUNT_ENGINE_*)
        [[ "$FILTER" == "account-engine" ]] || continue
        ;;
      ALPHA_ETL_*)
        [[ "$FILTER" == "alpha-etl" ]] || continue
        ;;
      ANALYTICS_ENGINE_*)
        [[ "$FILTER" == "analytics-engine" ]] || continue
        ;;
    esac
  fi

  if apps=$(check_var_in_apps "$var"); then
    live_vars+=("$var|$apps")
  else
    dead_vars+=("$var")
    found_dead=1
  fi
done <<< "$declared_vars"

# ── report ──────────────────────────────────────────────────────────────────
if [ ${#dead_vars[@]} -gt 0 ]; then
  printf "${RED}${BOLD}Dead env vars found (not referenced in any app):${RESET}\n"
  for v in "${dead_vars[@]}"; do
    printf "    ${RED}✗${RESET}  %s\n" "$v"
  done
  printf "\n"
fi

# Report live vars in verbose mode or if filter is set
if [ -n "$FILTER" ] && [ ${#live_vars[@]} -gt 0 ]; then
  printf "${GREEN}${BOLD}Active env vars (referenced in source):${RESET}\n"
  for entry in "${live_vars[@]}"; do
    IFS='|' read -r var apps <<< "$entry"
    printf "    ${GREEN}✓${RESET}  %s ${BOLD}(%s)${RESET}\n" "$var" "$apps"
  done
  printf "\n"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
if [ "$found_dead" -eq 0 ]; then
  printf "${GREEN}${BOLD}✓  No dead env vars found.${RESET}\n\n"
  exit 0
else
  printf "${RED}${BOLD}✗  Dead env vars detected — remove from root .env.example or add to source code.${RESET}\n\n"
  exit 1
fi
