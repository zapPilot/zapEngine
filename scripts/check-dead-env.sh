#!/usr/bin/env bash
# scripts/check-dead-env.sh
#
# Detects environment variables declared in .env.example that are never
# referenced in the app's source code.
#
# Supports all apps in this monorepo:
#   - TypeScript / Node.js  (account-engine, alpha-etl)
#   - Vite / React          (frontend)
#   - Next.js               (landing-page)
#   - Python / Pydantic     (analytics-engine)
#
# Usage:
#   bash scripts/check-dead-env.sh            # check all apps
#   bash scripts/check-dead-env.sh frontend   # check one app

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APPS_DIR="$REPO_ROOT/apps"

# ── ANSI colours ────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

found_dead=0

# ── Helper ───────────────────────────────────────────────────────────────────
# check_app <app-name> <src-dir> <ext> [<ext> ...]
#
# <app-name>  basename of the directory under apps/
# <src-dir>   absolute path to the source root to scan
# <ext>       one or more file extensions to include (e.g. ts tsx py)
check_app() {
  local app_name="$1"
  local src_dir="$2"
  shift 2
  local extensions=("$@")

  local env_file="$APPS_DIR/$app_name/.env.example"

  # ── guard: .env.example must exist ────────────────────────────────────────
  if [ ! -f "$env_file" ]; then
    printf "${YELLOW}[%s]${RESET} no .env.example — skipping\n" "$app_name"
    return
  fi

  # ── guard: source directory must exist ───────────────────────────────────
  if [ ! -d "$src_dir" ]; then
    printf "${YELLOW}[%s]${RESET} src dir not found: %s — skipping\n" \
      "$app_name" "$src_dir"
    return
  fi

  # ── parse declared env var names ──────────────────────────────────────────
  # Keep only non-comment lines that start with KEY= (all-caps + underscore).
  local declared_vars
  declared_vars=$(
    grep -E '^[A-Z_][A-Z0-9_]*=' "$env_file" \
      | sed 's/=.*//' \
      | sort -u
  )

  if [ -z "$declared_vars" ]; then
    printf "${GREEN}[%s]${RESET} no env vars declared in .env.example\n" "$app_name"
    return
  fi

  # ── build --include flags for grep ───────────────────────────────────────
  local include_args=()
  for ext in "${extensions[@]}"; do
    include_args+=("--include=*.$ext")
  done

  # ── check each var ────────────────────────────────────────────────────────
  local dead_vars=()
  while IFS= read -r var; do
    # -w  = whole-word match  (avoids e.g. PORT matching SUPPORT)
    # -rq = recursive, quiet  (exit 0 if found, 1 if not)
    if ! grep -rqw "$var" "${include_args[@]}" "$src_dir" 2>/dev/null; then
      dead_vars+=("$var")
    fi
  done <<< "$declared_vars"

  # ── report ────────────────────────────────────────────────────────────────
  if [ "${#dead_vars[@]}" -gt 0 ]; then
    printf "${RED}[%s]${RESET} ${BOLD}dead env vars found:${RESET}\n" "$app_name"
    for v in "${dead_vars[@]}"; do
      printf "    ${RED}✗${RESET}  %s\n" "$v"
    done
    found_dead=1
  else
    printf "${GREEN}[%s]${RESET} all vars referenced ✓\n" "$app_name"
  fi
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

printf "\n${BOLD}Checking for dead env vars across apps...${RESET}\n\n"

for entry in "${APP_REGISTRY[@]}"; do
  IFS='|' read -r app_name src_subdir exts <<< "$entry"

  # If a specific app was requested, skip all others
  if [ -n "$FILTER" ] && [ "$app_name" != "$FILTER" ]; then
    continue
  fi

  # shellcheck disable=SC2086
  check_app "$app_name" "$APPS_DIR/$app_name/$src_subdir" $exts
done

# ── Summary ──────────────────────────────────────────────────────────────────
printf "\n"
if [ "$found_dead" -eq 0 ]; then
  printf "${GREEN}${BOLD}✓  No dead env vars found.${RESET}\n\n"
  exit 0
else
  printf "${RED}${BOLD}✗  Dead env vars detected — update .env.example or remove the unused vars from source.${RESET}\n\n"
  exit 1
fi
