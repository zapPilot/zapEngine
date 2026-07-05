#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_dir="$(cd "$script_dir/.." && pwd)"
repo_root="$(cd "$app_dir/../.." && pwd)"
env_file="$repo_root/.env"

read_env_value() {
  local key="$1"
  local line
  local value

  if [[ ! -f "$env_file" ]]; then
    return 1
  fi

  line="$(grep -E "^[[:space:]]*${key}=" "$env_file" | tail -n 1 || true)"
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

encode_define() {
  printf '%s=%s' "$1" "$2" | base64 | tr -d '\n'
}

append_dart_define() {
  local encoded="$1"

  if [[ -n "${DART_DEFINES:-}" ]]; then
    DART_DEFINES="${DART_DEFINES},${encoded}"
  else
    DART_DEFINES="$encoded"
  fi
}

supabase_url="$(read_env_value SUPABASE_URL || true)"
supabase_anon_key="$(read_env_value SUPABASE_ANON_KEY || true)"
supabase_db_schema="$(read_env_value SUPABASE_DB_SCHEMA || true)"
supabase_db_schema="${supabase_db_schema:-from_fed_to_chain}"

if [[ -n "$supabase_url" && -n "$supabase_anon_key" ]]; then
  append_dart_define "$(encode_define SUPABASE_URL "$supabase_url")"
  append_dart_define "$(encode_define SUPABASE_ANON_KEY "$supabase_anon_key")"
  append_dart_define "$(encode_define SUPABASE_DB_SCHEMA "$supabase_db_schema")"
  export DART_DEFINES
else
  printf 'warning: Missing SUPABASE_URL or SUPABASE_ANON_KEY in %s; Xcode build will launch unconfigured.\n' "$env_file" >&2
fi

exec /bin/sh "$FLUTTER_ROOT/packages/flutter_tools/bin/xcode_backend.sh" "$@"
