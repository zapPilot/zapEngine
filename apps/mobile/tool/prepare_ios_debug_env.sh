#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  pnpm --filter @zapengine/mobile ios:debug:prepare

Reads SUPABASE_URL, SUPABASE_ANON_KEY, and optional SUPABASE_DB_SCHEMA from the
repo-root .env file, then regenerates ios/Flutter/Generated.xcconfig with
Flutter --dart-define values for local Xcode debug builds.
USAGE
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
cd "$APP_DIR"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

find_flutter_bin() {
  local generated_root=""
  if [[ -f ios/Flutter/Generated.xcconfig ]]; then
    generated_root="$(sed -nE 's/^FLUTTER_ROOT=(.*)$/\1/p' ios/Flutter/Generated.xcconfig | head -n 1)"
  fi

  local candidates=()
  if command -v flutter >/dev/null 2>&1; then
    candidates+=("$(command -v flutter)")
  fi
  if [[ -n "${FLUTTER_ROOT:-}" ]]; then
    candidates+=("${FLUTTER_ROOT}/bin/flutter")
  fi
  if [[ -n "$generated_root" ]]; then
    candidates+=("${generated_root}/bin/flutter")
  fi
  candidates+=(
    "/opt/homebrew/bin/flutter"
    "/usr/local/bin/flutter"
    "/opt/homebrew/Caskroom/flutter/3.32.6/flutter/bin/flutter"
  )

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

read_env_value() {
  local key="$1"
  local line
  local value

  if [[ ! -f "$ENV_FILE" ]]; then
    return 1
  fi

  line="$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    return 1
  fi

  value="${line#*=}"
  value="${value%$'\r'}"

  case "$value" in
    \"*\")
      value="${value#\"}"
      value="${value%\"}"
      ;;
    \'*\')
      value="${value#\'}"
      value="${value%\'}"
      ;;
  esac

  printf '%s' "$value"
}

FLUTTER_BIN="$(find_flutter_bin || true)"
if [[ -z "$FLUTTER_BIN" ]]; then
  echo "Could not find flutter. Add Flutter to PATH or set FLUTTER_ROOT." >&2
  exit 1
fi

supabase_url="$(read_env_value SUPABASE_URL || true)"
supabase_anon_key="$(read_env_value SUPABASE_ANON_KEY || true)"
supabase_db_schema="$(read_env_value SUPABASE_DB_SCHEMA || true)"
supabase_db_schema="${supabase_db_schema:-from_fed_to_chain}"

if [[ -z "$supabase_url" || -z "$supabase_anon_key" ]]; then
  echo "Missing SUPABASE_URL or SUPABASE_ANON_KEY in $ENV_FILE." >&2
  exit 1
fi

"$FLUTTER_BIN" pub get
"$FLUTTER_BIN" build ios --debug --config-only \
  --dart-define="SUPABASE_URL=$supabase_url" \
  --dart-define="SUPABASE_ANON_KEY=$supabase_anon_key" \
  --dart-define="SUPABASE_DB_SCHEMA=$supabase_db_schema"

echo "Prepared iOS debug config with Supabase dart-defines for Xcode."
