#!/usr/bin/env bash
set -euo pipefail

mobile_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_root="$(cd "$mobile_dir/../.." && pwd)"
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

supabase_url="$(read_env_value SUPABASE_URL || true)"
supabase_anon_key="$(read_env_value SUPABASE_ANON_KEY || true)"
supabase_db_schema="$(read_env_value SUPABASE_DB_SCHEMA || true)"
supabase_db_schema="${supabase_db_schema:-from_fed_to_chain}"

if [[ -n "$supabase_url" && -n "$supabase_anon_key" ]]; then
  exec flutter run \
    --dart-define="SUPABASE_URL=$supabase_url" \
    --dart-define="SUPABASE_ANON_KEY=$supabase_anon_key" \
    --dart-define="SUPABASE_DB_SCHEMA=$supabase_db_schema" \
    "$@"
fi

printf 'No root .env Supabase config found; running Flutter without Supabase dart-defines.\n' >&2
exec flutter run "$@"
