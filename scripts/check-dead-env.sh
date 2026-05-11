#!/usr/bin/env bash
# scripts/check-dead-env.sh
#
# Detects environment variables declared in root .env.example that are never
# referenced in any app's source code, and code references to env vars missing
# from root .env.example.
#
# Supports all apps in this monorepo:
#   - TypeScript / Node.js  (account-engine, alpha-etl, podcast-pipeline)
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
found_orphan=0

declare -a EXCLUDED_BUILTINS=(
  "NODE_ENV"
  "CI"
  "PATH"
  "HOME"
  "USER"
  "PWD"
  "PORT"
  "TZ"
  "LANG"
  "TERM"
  "DEBUG"
  "npm_*"
)

is_excluded_builtin() {
  local var="$1"

  case "$var" in
    NODE_ENV | CI | PATH | HOME | USER | PWD | PORT | TZ | LANG | TERM | DEBUG | npm_*)
      return 0
      ;;
  esac

  return 1
}

is_declared_var() {
  local var="$1"
  grep -Fxq "$var" <<< "$declared_vars"
}

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

check_var_in_app_source() {
  local app_name="$1"
  local src_subdir="$2"
  local exts="$3"
  local var="$4"
  local src_dir="$APPS_DIR/$app_name/$src_subdir"

  [ -d "$src_dir" ] || return 1

  local include_args=()
  for ext in $exts; do
    include_args+=("--include=*.$ext")
  done
  include_args+=("--exclude=*.test.*" "--exclude=*.spec.*")

  grep -rqw "$var" "${include_args[@]}" "$src_dir" 2>/dev/null
}

scan_ts_env_refs() {
  local src_dir="$1"
  shift
  local include_args=("$@")
  local matches

  matches=$(grep -rhEo "${include_args[@]}" 'process\.env\.[A-Z_][A-Z0-9_]*' "$src_dir" 2>/dev/null || true)
  if [ -n "$matches" ]; then
    sed -E 's/^process\.env\.//' <<< "$matches"
  fi

  matches=$(grep -rhEo "${include_args[@]}" "process\\.env\\[['\"][A-Z_][A-Z0-9_]*['\"]\\]" "$src_dir" 2>/dev/null || true)
  if [ -n "$matches" ]; then
    sed -E "s/^process\\.env\\[['\"]([A-Z_][A-Z0-9_]*)['\"]\\]$/\\1/" <<< "$matches"
  fi

  matches=$(grep -rhEo "${include_args[@]}" 'import\.meta\.env\.[A-Z_][A-Z0-9_]*' "$src_dir" 2>/dev/null || true)
  if [ -n "$matches" ]; then
    sed -E 's/^import\.meta\.env\.//' <<< "$matches"
  fi
}

scan_python_env_refs() {
  local src_dir="$1"
  shift
  local include_args=("$@")
  local matches

  matches=$(grep -rhEo "${include_args[@]}" "os\\.getenv\\(['\"][A-Z_][A-Z0-9_]*['\"]\\)" "$src_dir" 2>/dev/null || true)
  if [ -n "$matches" ]; then
    sed -E "s/^os\\.getenv\\(['\"]([A-Z_][A-Z0-9_]*)['\"]\\)$/\\1/" <<< "$matches"
  fi

  matches=$(grep -rhEo "${include_args[@]}" "os\\.environ\\[['\"][A-Z_][A-Z0-9_]*['\"]\\]" "$src_dir" 2>/dev/null || true)
  if [ -n "$matches" ]; then
    sed -E "s/^os\\.environ\\[['\"]([A-Z_][A-Z0-9_]*)['\"]\\]$/\\1/" <<< "$matches"
  fi

  matches=$(grep -rhEo "${include_args[@]}" "os\\.environ\\.get\\(['\"][A-Z_][A-Z0-9_]*['\"]\\)" "$src_dir" 2>/dev/null || true)
  if [ -n "$matches" ]; then
    sed -E "s/^os\\.environ\\.get\\(['\"]([A-Z_][A-Z0-9_]*)['\"]\\)$/\\1/" <<< "$matches"
  fi
}

scan_env_refs_for_app() {
  local app_name="$1"
  local src_subdir="$2"
  local exts="$3"
  local src_dir="$APPS_DIR/$app_name/$src_subdir"

  [ -d "$src_dir" ] || return 0

  local include_args=()
  for ext in $exts; do
    include_args+=("--include=*.$ext")
  done
  include_args+=("--exclude=*.test.*" "--exclude=*.spec.*")

  case " $exts " in
    *" ts "* | *" tsx "* | *" js "* | *" jsx "*)
      scan_ts_env_refs "$src_dir" "${include_args[@]}"
      ;;
  esac

  case " $exts " in
    *" py "*)
      scan_python_env_refs "$src_dir" "${include_args[@]}"
      ;;
  esac
}

scan_env_refs_in_code() {
  for entry in "${APP_REGISTRY[@]}"; do
    IFS='|' read -r app_name src_subdir exts <<< "$entry"

    if [ -n "$FILTER" ] && [ "$FILTER" != "$app_name" ]; then
      continue
    fi

    while IFS= read -r var; do
      [ -n "$var" ] || continue
      printf "%s|%s\n" "$var" "$app_name"
    done < <(scan_env_refs_for_app "$app_name" "$src_subdir" "$exts" | sort -u)
  done
}

scan_fly_toml_env_keys() {
  local fly_file="$1"

  awk '
    /^\[env\]/ {
      section = "env"
      next
    }
    /^\[deploy\]/ {
      section = "deploy"
      next
    }
    /^\[/ {
      section = ""
      next
    }
    section == "env" {
      line = $0
      sub(/#.*/, "", line)
      if (line ~ /^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=/) {
        sub(/^[[:space:]]*/, "", line)
        sub(/[[:space:]]*=.*/, "", line)
        print line
      }
    }
    section == "deploy" {
      line = $0
      sub(/#.*/, "", line)
      if (line ~ /secrets[[:space:]]*=/) {
        gsub(/["'\''\[\],=]/, " ", line)
        n = split(line, parts, /[[:space:]]+/)
        for (i = 1; i <= n; i++) {
          if (parts[i] ~ /^[A-Z_][A-Z0-9_]*$/) {
            print parts[i]
          }
        }
      }
    }
  ' "$fly_file" | sort -u
}

# ── App registry ─────────────────────────────────────────────────────────────
# Each entry: "app-name|src-subdir|ext1 ext2 ..."
declare -a APP_REGISTRY=(
  "account-engine|src|ts"
  "alpha-etl|src|ts"
  "podcast-pipeline|src|ts"
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
duplicate_vars=$(
  grep -E '^[A-Z_][A-Z0-9_]*=' "$ENV_FILE" \
    | sed 's/=.*//' \
    | sort \
    | uniq -d
)

if [ -n "$duplicate_vars" ]; then
  printf "${RED}${BOLD}Duplicate env vars found in .env.example:${RESET}\n"
  while IFS= read -r var; do
    printf "    ${RED}✗${RESET}  %s\n" "$var"
  done <<< "$duplicate_vars"
  printf "\n${RED}${BOLD}✗  Duplicate env vars are ambiguous under dotenv parsing.${RESET}\n\n"
  exit 1
fi

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

# ── reverse check: code references must be declared ─────────────────────────
missing_vars=()

while IFS='|' read -r var app_name; do
  [ -n "$var" ] || continue

  if is_excluded_builtin "$var" || is_declared_var "$var"; then
    continue
  fi

  missing_vars+=("$var|$app_name")
  found_orphan=1
done < <(scan_env_refs_in_code | sort -u)

if [ ${#missing_vars[@]} -gt 0 ]; then
  printf "${RED}${BOLD}Code references undeclared env vars:${RESET}\n"
  for entry in "${missing_vars[@]}"; do
    IFS='|' read -r var app_name <<< "$entry"
    printf "    ${RED}✗${RESET}  Code references undeclared env var: %s ${BOLD}(%s)${RESET}\n" "$var" "$app_name"
  done
  printf "\n"
fi

# ── fly.toml soft audit: deployed vars should still be used ─────────────────
fly_warnings=()

for entry in "${APP_REGISTRY[@]}"; do
  IFS='|' read -r app_name src_subdir exts <<< "$entry"

  if [ -n "$FILTER" ] && [ "$FILTER" != "$app_name" ]; then
    continue
  fi

  fly_file="$APPS_DIR/$app_name/fly.toml"
  [ -f "$fly_file" ] || continue

  while IFS= read -r var; do
    [ -n "$var" ] || continue
    is_excluded_builtin "$var" && continue

    if ! check_var_in_app_source "$app_name" "$src_subdir" "$exts" "$var"; then
      fly_warnings+=("$var|$app_name")
    fi
  done < <(scan_fly_toml_env_keys "$fly_file")
done

if [ ${#fly_warnings[@]} -gt 0 ]; then
  printf "${YELLOW}${BOLD}fly.toml env vars not referenced in app source (warning only):${RESET}\n"
  for entry in "${fly_warnings[@]}"; do
    IFS='|' read -r var app_name <<< "$entry"
    printf "    ${YELLOW}!${RESET}  %s ${BOLD}(%s)${RESET}\n" "$var" "$app_name"
  done
  printf "\n"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
if [ "$found_dead" -eq 0 ] && [ "$found_orphan" -eq 0 ]; then
  printf "${GREEN}${BOLD}✓  No dead or undeclared env vars found.${RESET}\n\n"
  exit 0
else
  printf "${RED}${BOLD}✗  Env var drift detected — sync root .env.example and source code.${RESET}\n\n"
  exit 1
fi
