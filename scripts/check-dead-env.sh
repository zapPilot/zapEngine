#!/usr/bin/env bash
# scripts/check-dead-env.sh
#
# Treats config/env.manifest.mjs as the canonical env-key registry. Detects keys that
# are dead in source, source references missing from the registry, and (when a
# local .env exists) duplicate, blank, or unregistered local overrides.
#
# Supports all apps in this monorepo:
#   - TypeScript / Node.js  (account-engine, alpha-etl, podcast-pipeline)
#   - Expo / React Native   (app)
#   - Next.js               (landing-page)
#   - Python / Pydantic     (analytics-engine)
#
# Usage:
#   bash scripts/check-dead-env.sh            # check all apps
#   bash scripts/check-dead-env.sh app        # check specific app only

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APPS_DIR="$REPO_ROOT/apps"
PACKAGES_DIR="$REPO_ROOT/packages"

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
  "EDITOR"
  "DEBUG"
  "DEV"
  "MODE"
  "npm_*"
  "PROD"
  "SSR"
)

is_excluded_builtin() {
  local var="$1"

  case "$var" in
    NODE_ENV | CI | PATH | HOME | USER | PWD | PORT | TZ | LANG | TERM | EDITOR | DEBUG | DEV | MODE | PROD | SSR | npm_*)
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
# var_in_apps <var-name> returns list of apps that reference the var.
# Backed by the token index built in build_token_index() — a lookup, not a scan.
check_var_in_apps() {
  local var="$1"
  local found_in

  found_in=$(awk -F'\t' -v token="$var" '$1 == token { printf "%s%s", sep, $2; sep = " " }' "$TOKEN_INDEX")

  if [ -n "$found_in" ]; then
    printf "%s" "$found_in"
    return 0
  fi
  return 1
}

check_var_in_app_source() {
  local base_dir="$1"
  local app_name="$2"
  local src_subdir="$3"
  local exts="$4"
  local var="$5"
  local lower_var
  lower_var=$(tr '[:upper:]' '[:lower:]' <<< "$var")
  local unprefixed_lower_var="${lower_var#analytics_}"
  local src_dir="$base_dir/$app_name/$src_subdir"

  [ -d "$src_dir" ] || return 1

  local include_args=()
  for ext in $exts; do
    include_args+=("--include=*.$ext")
  done
  include_args+=("--exclude=*.test.*" "--exclude=*.spec.*")

  grep -rqw "$var" "${include_args[@]}" "$src_dir" 2>/dev/null ||
    { [[ " $exts " == *" py "* ]] && grep -rqiE "\\b(${lower_var}|${unprefixed_lower_var})\\b" "${include_args[@]}" "$src_dir" 2>/dev/null; }
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
  local base_dir="$1"
  local app_name="$2"
  local src_subdir="$3"
  local exts="$4"
  local src_dir="$base_dir/$app_name/$src_subdir"

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
    IFS='|' read -r base_dir app_name src_subdir exts <<< "$entry"

    if [ -n "$FILTER" ] && [ "$FILTER" != "$app_name" ]; then
      continue
    fi

    while IFS= read -r var; do
      [ -n "$var" ] || continue
      printf "%s|%s\n" "$var" "$app_name"
    done < <(scan_env_refs_for_app "$base_dir" "$app_name" "$src_subdir" "$exts" | sort -u)
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

# ── App registry (auto-discovered) ───────────────────────────────────────────
# Each entry: "app-name|src-subdir|ext1 ext2 ...". Discovered from apps/* so a
# new app is scanned automatically — no hand-maintained list to forget. Any
# apps/<app> with a src/ tree is included: Python (pyproject.toml) scanned as
# .py, otherwise (package.json) as .ts/.tsx. Apps without src/ are skipped.
declare -a APP_REGISTRY=()
while IFS= read -r _app_dir; do
  _app_name="$(basename "$_app_dir")"
  [ -d "$_app_dir/src" ] || continue
  if [ -f "$_app_dir/pyproject.toml" ]; then
    APP_REGISTRY+=("$APPS_DIR|$_app_name|src|py")
  elif [ -f "$_app_dir/package.json" ]; then
    APP_REGISTRY+=("$APPS_DIR|$_app_name|src|ts tsx")
  fi
done < <(find "$APPS_DIR" -mindepth 1 -maxdepth 1 -type d | sort)

while IFS= read -r _pkg_dir; do
  _pkg_name="$(basename "$_pkg_dir")"
  [ -d "$_pkg_dir/src" ] || continue
  if [ -f "$_pkg_dir/package.json" ]; then
    APP_REGISTRY+=("$PACKAGES_DIR|$_pkg_name|src|ts tsx")
  elif [ -f "$_pkg_dir/pyproject.toml" ]; then
    APP_REGISTRY+=("$PACKAGES_DIR|$_pkg_name|src|py")
  fi
done < <(find "$PACKAGES_DIR" -mindepth 1 -maxdepth 1 -type d | sort)

# Operational scripts and CI fixtures are env consumers too, even though they
# are not application workspaces.
APP_REGISTRY+=("$REPO_ROOT|.|scripts|ts js mjs cjs sh py")
APP_REGISTRY+=("$REPO_ROOT|.|.github|yml yaml")

# ── Filter to requested app (if any) ─────────────────────────────────────────
FILTER="${1:-}"

# ── Main check ───────────────────────────────────────────────────────────────
printf "\n${BOLD}Checking env manifest for dead env vars...${RESET}\n\n"

declared_vars=$(node "$REPO_ROOT/scripts/env/cli.mjs" keys)

node --test "$REPO_ROOT/scripts/env/lib.test.mjs"
node --test "$REPO_ROOT/scripts/env/remote.test.mjs"
node --test "$REPO_ROOT/scripts/ops-lib.test.mjs"

manifest_mappings=$(node "$REPO_ROOT/scripts/env/cli.mjs" mappings)
projected_vars=$(
  printf '%s\n' "$manifest_mappings" \
    | tr '|' '\n' \
    | grep -vE '^(client|server|host)$' \
    | sort -u
)

if [ -z "$declared_vars" ]; then
  printf "${YELLOW}No env vars declared in the manifest${RESET}\n"
  exit 0
fi

# ── Token index ──────────────────────────────────────────────────────────────
# check_var_in_apps() used to run one recursive grep per (token, tree) pair.
# With ~225 declared keys plus their projections over ~16 source trees that is
# thousands of full-tree scans, and it dominated the pre-commit hook. Scan each
# tree exactly once against the whole token set instead, then look answers up.
#
# The index is TAB-separated `token<TAB>app-name` lines, appended in
# APP_REGISTRY order so lookups report apps in the same order as before.
TOKEN_INDEX_DIR=$(mktemp -d)
trap 'rm -rf "$TOKEN_INDEX_DIR"' EXIT

TOKEN_INDEX="$TOKEN_INDEX_DIR/index"
token_patterns="$TOKEN_INDEX_DIR/tokens"
lower_patterns="$TOKEN_INDEX_DIR/lower-tokens"
lower_map="$TOKEN_INDEX_DIR/lower-map"
tree_hits="$TOKEN_INDEX_DIR/tree-hits"

build_token_index() {
  # Declared keys and their projections are both looked up, so both are scanned.
  { printf '%s\n' "$declared_vars"; printf '%s\n' "$projected_vars"; } \
    | grep -v '^$' \
    | sort -u > "$token_patterns"

  # Python sources spell keys as lowercase settings fields, with or without the
  # analytics_ prefix. Keep a reverse map: stripping the prefix can collapse two
  # canonical keys onto one lowercase token, so a token maps to 1..n keys.
  : > "$lower_map"
  while IFS= read -r token; do
    lower=$(tr '[:upper:]' '[:lower:]' <<< "$token")
    printf '%s\t%s\n' "$lower" "$token" >> "$lower_map"
    printf '%s\t%s\n' "${lower#analytics_}" "$token" >> "$lower_map"
  done < "$token_patterns"
  cut -f1 "$lower_map" | sort -u > "$lower_patterns"

  : > "$TOKEN_INDEX"

  for entry in "${APP_REGISTRY[@]}"; do
    IFS='|' read -r base_dir app_name src_subdir exts <<< "$entry"
    src_dir="$base_dir/$app_name/$src_subdir"

    [ -d "$src_dir" ] || continue

    include_args=()
    find_name_args=()
    first_ext=1
    for ext in $exts; do
      include_args+=("--include=*.$ext")
      [ "$first_ext" = 1 ] || find_name_args+=(-o)
      first_ext=0
      find_name_args+=(-name "*.$ext")
    done

    # No --exclude for tests here: the original whole-word scan counted test
    # files as references too (unlike check_var_in_app_source below).
    : > "$tree_hits"
    grep -rhowF -f "$token_patterns" "${include_args[@]}" "$src_dir" 2>/dev/null \
      >> "$tree_hits" || true

    if [[ " $exts " == *" py "* ]]; then
      # Python spells keys in lowercase, so this pass has to be case-insensitive.
      # `grep -iowF` over a large tree costs ~3x lowercasing the haystack first,
      # and awk keeps per-file line boundaries so the two agree exactly.
      find "$src_dir" -type f \( "${find_name_args[@]}" \) \
        -exec awk '{ print tolower($0) }' {} + 2>/dev/null \
        | grep -howF -f "$lower_patterns" 2>/dev/null \
        | awk -F'\t' '
            NR == FNR { map[$1] = map[$1] " " $2; next }
            ($0 in map) {
              n = split(map[$0], keys, " ")
              for (i = 1; i <= n; i++) if (keys[i] != "") print keys[i]
            }
          ' "$lower_map" - >> "$tree_hits" || true
    fi

    sort -u "$tree_hits" | awk -v app="$app_name" 'NF { print $0 "\t" app }' >> "$TOKEN_INDEX"
  done
}

build_token_index

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
        # VITE_* keys are app-core's env surface; hosts map onto them
        # (app: EXPO_PUBLIC_*, desktop: ZAP_* / config.json).
        [[ "$FILTER" == "desktop" || "$FILTER" == "app-core" ]] || continue
        ;;
      EXPO_PUBLIC_*)
        [[ "$FILTER" == "app" ]] || continue
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
    projected_live=""
    mapping=$(printf '%s\n' "$manifest_mappings" | grep -E "^${var}\\|" || true)
    IFS='|' read -r _canonical manifest_kind projection_a projection_b projection_c <<< "$mapping"
    if [ "$manifest_kind" = "host" ]; then
      live_vars+=("$var|host tooling")
      continue
    fi
    for projection in "$projection_a" "$projection_b" "$projection_c"; do
      [ -n "$projection" ] || continue
      if projection_apps=$(check_var_in_apps "$projection"); then
        projected_live="${projected_live:+$projected_live }$projection_apps"
      fi
    done
    if [ -n "$projected_live" ]; then
      live_vars+=("$var|$projected_live")
    else
      dead_vars+=("$var")
      found_dead=1
    fi
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

  if is_excluded_builtin "$var" || is_declared_var "$var" || grep -Fxq "$var" <<< "$projected_vars"; then
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
  IFS='|' read -r base_dir app_name src_subdir exts <<< "$entry"

  if [ -n "$FILTER" ] && [ "$FILTER" != "$app_name" ]; then
    continue
  fi

  fly_file="$base_dir/$app_name/fly.toml"
  [ -f "$fly_file" ] || continue

  while IFS= read -r var; do
    [ -n "$var" ] || continue
    is_excluded_builtin "$var" && continue

    if ! check_var_in_app_source "$base_dir" "$app_name" "$src_subdir" "$exts" "$var"; then
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
  printf "${GREEN}${BOLD}✓  Env registry and source references are in sync.${RESET}\n\n"
  exit 0
else
  printf "${RED}${BOLD}✗  Env var drift detected — sync source and manifest.${RESET}\n\n"
  exit 1
fi
