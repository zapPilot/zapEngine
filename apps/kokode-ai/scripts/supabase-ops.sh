#!/usr/bin/env bash
# Kokode function operations. Database DDL belongs exclusively to the root
# supabase/migrations pipeline; SQL/apply/history-repair commands are unavailable.
# Tasks: check [--strict], secrets, deploy, dev, e2e, e2e-cleanup [--yes], gh-vars.
# Deploy only genba-lead; never prune or deploy all shared-project functions.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
INFISICAL="$ROOT/scripts/infisical.sh"
SUPABASE_CLI=(npx --yes supabase@2.117.0)
MGMT_API="https://api.supabase.com/v1"
FUNCTION_NAME="genba-lead"
SITE_ORIGIN="https://www.kokode.xyz"
# KOKODE_LEAD_ALLOWED_ORIGINS is project-wide; keep the KOKODE site allowed.
DEV_ORIGIN="http://localhost:5173"
E2E_EMAIL_LIKE='e2e+%@example.com'
# zapEngine's exposed schemas; they must survive every KOKODE change.
ZAP_SCHEMAS='["public","graphql_public","review_web","from_fed_to_chain"]'

# CI may inject the public project URL and/or access token. Capture them, then
# remove the exported originals so child processes never inherit the token.
INJECTED_SUPABASE_URL="${SUPABASE_URL:-}"
INJECTED_SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
unset SUPABASE_URL SUPABASE_ACCESS_TOKEN

SUPABASE_URL=""
PROJECT_REF=""
SUPABASE_ACCESS_TOKEN=""

die() {
  echo "error: $*" >&2
  exit 1
}

log() { echo "==> $*" >&2; }

load_project() {
  local url
  if [[ -n $INJECTED_SUPABASE_URL ]]; then
    url=$INJECTED_SUPABASE_URL
  else
    url=$("$INFISICAL" zap -- printenv SUPABASE_URL) ||
      die "cannot read SUPABASE_URL from the Zap Pilot Infisical project (prod /)"
  fi
  [[ $url =~ ^https://([a-z0-9]{20})\.supabase\.co/?$ ]] ||
    die "SUPABASE_URL is not of the form https://<20-char ref>.supabase.co"
  PROJECT_REF=${BASH_REMATCH[1]}
  SUPABASE_URL="https://$PROJECT_REF.supabase.co"
}

load_token() {
  if [[ -n $INJECTED_SUPABASE_ACCESS_TOKEN ]]; then
    SUPABASE_ACCESS_TOKEN=$INJECTED_SUPABASE_ACCESS_TOKEN
  else
    SUPABASE_ACCESS_TOKEN=$("$INFISICAL" kokode -- printenv SUPABASE_ACCESS_TOKEN) ||
      die "cannot read SUPABASE_ACCESS_TOKEN from the kokode-ai Infisical project (prod /)"
  fi
  [[ $SUPABASE_ACCESS_TOKEN == sbp_* ]] ||
    die "SUPABASE_ACCESS_TOKEN does not look like a personal access token (sbp_...)"
}

# Fill CLEAN_ENV with the non-secret variables children may inherit, plus
# any extra names given.
clean_env() {
  CLEAN_ENV=()
  local name
  for name in PATH HOME TMPDIR TERM LANG LC_ALL "$@"; do
    if [[ -n ${!name+x} ]]; then CLEAN_ENV+=("$name=${!name}"); fi
  done
}

# Run a command with SUPABASE_ACCESS_TOKEN exported, handed over on fd 3.
run_with_token() {
  clean_env
  env -i "${CLEAN_ENV[@]}" bash -c \
    'IFS= read -r SUPABASE_ACCESS_TOKEN <&3; exec 3<&-; export SUPABASE_ACCESS_TOKEN; exec "$@"' \
    bash "$@" 3< <(printf '%s\n' "$SUPABASE_ACCESS_TOKEN")
}

# mgmt_query <sql> [read_only=true|false] [params JSON array] -> JSON rows
mgmt_query() {
  local sql=$1 read_only=${2:-false} params=${3:-[]} body
  body=$(jq -n --arg q "$sql" --argjson ro "$read_only" --argjson p "$params" \
    '{query: $q, read_only: $ro} + (if ($p | length) > 0 then {parameters: $p} else {} end)')
  curl -sS --fail-with-body \
    -X POST "$MGMT_API/projects/$PROJECT_REF/database/query" \
    -H @<(printf 'Authorization: Bearer %s\n' "$SUPABASE_ACCESS_TOKEN") \
    -H "Content-Type: application/json" \
    --data-binary @- <<<"$body"
}

read -r -d '' CHECK_SQL <<'SQL' || true
with leads as (select to_regclass('kokode_ai.leads') as oid),
ns as (select oid from pg_namespace where nspname = 'kokode_ai'),
legacy as (select to_regnamespace('genba_ai') as oid),
pgrst as (
  select regexp_replace(setting, '^pgrst\.db_schemas=', '') as schemas
  from pg_db_role_setting settings
  join pg_roles roles on roles.oid = settings.setrole
  cross join lateral unnest(settings.setconfig) setting
  where roles.rolname = 'authenticator'
    and setting like 'pgrst.db_schemas=%'
  limit 1
)
select
  (select oid from leads) is not null as leads_table_exists,
  coalesce((select relrowsecurity from pg_class
            where oid = (select oid from leads)), false) as leads_rls_enabled,
  coalesce(has_schema_privilege('anon', (select oid from ns), 'USAGE'), false)
    or coalesce(has_table_privilege('anon', (select oid from leads),
         'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), false)
    as anon_has_access,
  coalesce(has_schema_privilege('authenticated', (select oid from ns), 'USAGE'), false)
    or coalesce(has_table_privilege('authenticated', (select oid from leads),
         'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), false)
    as authenticated_has_access,
  coalesce(has_schema_privilege('service_role', (select oid from ns), 'USAGE')
    and has_table_privilege('service_role', (select oid from leads), 'INSERT'), false)
    as service_role_can_insert,
  (select oid from legacy) is not null as legacy_schema_exists,
  (select schemas from pgrst) as pgrst_db_schemas,
  exists (select 1 from supabase_migrations.schema_migrations
          where version = '20261004000000') as canonical_adoption_recorded,
  (select count(*) from supabase_migrations.schema_migrations) as schema_migrations_count,
  (select count(*) from supabase_migrations.schema_migrations
   where version in ('20260922000000', '20260923021804', '20260925011500', '20260925021000')) as kokode_versions_in_history
SQL

task_check() {
  local strict=${1:-}
  load_project
  load_token
  local report
  report=$(mgmt_query "$CHECK_SQL" true | jq '.[0]')
  jq . <<<"$report"
  jq -r --argjson zap "$ZAP_SCHEMAS" '
    (.pgrst_db_schemas // "" | split(",") | map(gsub("^\\s+|\\s+$"; ""))) as $exposed
    | [
        ["invariant", "zapEngine schemas still exposed \($zap | join(","))",
          ($zap - $exposed | length) == 0],
        ["invariant", "no KOKODE version in the migration history",
          (.kokode_versions_in_history | tonumber) == 0],
        ["kokode", "kokode_ai.leads exists", .leads_table_exists],
        ["kokode", "RLS enabled on kokode_ai.leads", .leads_rls_enabled],
        ["kokode", "anon has no access", (.anon_has_access | not)],
        ["kokode", "authenticated has no access", (.authenticated_has_access | not)],
        ["kokode", "service_role can insert", .service_role_can_insert],
        ["kokode", "kokode_ai in pgrst.db_schemas", ($exposed | index("kokode_ai")) != null],
        ["kokode", "legacy genba_ai schema removed", (.legacy_schema_exists | not)],
        ["kokode", "legacy genba_ai not exposed", ($exposed | index("genba_ai")) == null]
      ][]
    | "\(if .[2] then "OK" else "NG" end)  [\(.[0])] \(.[1])"
  ' <<<"$report"
  jq -e --argjson zap "$ZAP_SCHEMAS" '
    (.pgrst_db_schemas // "" | split(",") | map(gsub("^\\s+|\\s+$"; ""))) as $exposed
    | ($zap - $exposed | length) == 0 and (.kokode_versions_in_history | tonumber) == 0
  ' <<<"$report" >/dev/null || die "a zapEngine invariant is broken -- stop and investigate"

  if [[ $strict == --strict ]]; then
    jq -e '
      (.pgrst_db_schemas // "" | split(",") | map(gsub("^\\s+|\\s+$"; ""))) as $exposed
      | .canonical_adoption_recorded
        and .leads_table_exists
        and .leads_rls_enabled
        and (.anon_has_access | not)
        and (.authenticated_has_access | not)
        and .service_role_can_insert
        and (($exposed | index("kokode_ai")) != null)
        and (.legacy_schema_exists | not)
        and (($exposed | index("genba_ai")) == null)
    ' <<<"$report" >/dev/null ||
      die "KOKODE backend is not fully provisioned"
  fi
}

task_secrets() {
  load_project
  load_token
  log "setting KOKODE_LEAD_ALLOWED_ORIGINS (function secrets are project-wide)"
  run_with_token "${SUPABASE_CLI[@]}" secrets set \
    "KOKODE_LEAD_ALLOWED_ORIGINS=$SITE_ORIGIN,$DEV_ORIGIN" \
    --project-ref "$PROJECT_REF"
}

task_deploy() {
  load_project
  load_token
  log "deploying ONLY $FUNCTION_NAME (server-side bundle, verify_jwt off)"
  run_with_token "${SUPABASE_CLI[@]}" functions deploy "$FUNCTION_NAME" --workdir "$ROOT/../.." \
    --project-ref "$PROJECT_REF" --no-verify-jwt --use-api
}

task_dev() {
  load_project
  log "vite dev against the live legacy `genba-lead` -- submitted leads go to the PRODUCTION table"
  clean_env
  exec env -i "${CLEAN_ENV[@]}" "VITE_SUPABASE_URL=$SUPABASE_URL" pnpm dev
}

task_gh_vars() {
  load_project
  clean_env GH_TOKEN GITHUB_TOKEN GH_HOST GH_CONFIG_DIR XDG_CONFIG_HOME
  # Value on stdin (no trailing newline): nothing echoed, nothing in argv.
  printf '%s' "$SUPABASE_URL" |
    env -i "${CLEAN_ENV[@]}" gh variable set VITE_SUPABASE_URL
}

FAILURES=0

expect() {
  if [[ $2 == "$3" ]]; then
    echo "PASS  $1"
  else
    echo "FAIL  $1 (expected $2, got ${3:-<empty>})"
    FAILURES=$((FAILURES + 1))
  fi
}

# call_fn <METHOD> <origin> [json] -> HTTP_STATUS, HTTP_ERROR, HTTP_ACAO
call_fn() {
  local method=$1 origin=$2 data=${3:-} out headers
  out=$(mktemp)
  headers=$(mktemp)
  local args=(-sS -o "$out" -D "$headers" -w '%{http_code}' -X "$method"
    "$SUPABASE_URL/functions/v1/$FUNCTION_NAME" -H "Origin: $origin")
  if [[ $method == OPTIONS ]]; then
    args+=(-H "Access-Control-Request-Method: POST"
      -H "Access-Control-Request-Headers: content-type")
  else
    args+=(-H "Content-Type: application/json" --data-binary "$data")
  fi
  HTTP_STATUS=$(curl "${args[@]}")
  HTTP_ERROR=$(jq -r '.error // (if .ok then "ok" else empty end)' "$out" 2>/dev/null || true)
  HTTP_ACAO=$(grep -i '^access-control-allow-origin:' "$headers" |
    cut -d' ' -f2- | tr -d '\r' || true)
  rm -f "$out" "$headers"
}

lead_json() {
  jq -n --arg email "$1" '{
    email: $email, interest: "KOKODE Studio", organization: "", name: "e2e",
    source: "kokode-website", utm_source: "e2e", utm_medium: "",
    utm_campaign: "", utm_term: "", utm_content: "", referrer: "",
    landing_url: "", page_url: ""
  }'
}

count_leads() {
  mgmt_query "select count(*) as n from kokode_ai.leads where email = \$1" true \
    "$(jq -nc --arg e "$1" '[$e]')" | jq -r '.[0].n'
}

task_e2e() {
  load_project
  load_token
  local ts email evil_email
  ts="$(date +%s)-$RANDOM-$RANDOM"
  email="e2e+$ts@example.com"
  evil_email="e2e+$ts-evil@example.com"
  log "e2e lead: $email"

  call_fn OPTIONS "$SITE_ORIGIN"
  expect "OPTIONS from the site origin -> 204" 204 "$HTTP_STATUS"
  expect "preflight echoes the site origin" "$SITE_ORIGIN" "$HTTP_ACAO"

  call_fn POST "$SITE_ORIGIN" "$(lead_json "$email")"
  expect "POST valid lead without any key -> 201" 201 "$HTTP_STATUS"
  expect "POST valid lead body" ok "$HTTP_ERROR"

  call_fn POST "$SITE_ORIGIN" "$(lead_json "not-an-email")"
  expect "POST bad email -> 400" 400 "$HTTP_STATUS"
  expect "POST bad email code" invalid_email "$HTTP_ERROR"

  call_fn POST "https://evil.example" "$(lead_json "$evil_email")"
  expect "POST from another origin -> 403" 403 "$HTTP_STATUS"
  expect "POST from another origin code" origin_not_allowed "$HTTP_ERROR"

  expect "valid lead stored exactly once" 1 "$(count_leads "$email")"
  expect "rejected-origin lead not stored" 0 "$(count_leads "$evil_email")"

  # Delete only this run's disposable fixture, never earlier E2E leads.
  mgmt_query "delete from kokode_ai.leads where email = \$1" false \
    "$(jq -nc --arg e "$email" '[$e]')" >/dev/null
  echo "Cleaned this run's E2E lead"
  [[ $FAILURES -eq 0 ]] || die "$FAILURES e2e check(s) failed"
}

task_e2e_cleanup() {
  local confirm=${1:-} rows count answer params
  load_project
  load_token
  params=$(jq -nc --arg p "$E2E_EMAIL_LIKE" '[$p]')
  rows=$(mgmt_query "select email, created_at from kokode_ai.leads
    where email like \$1 order by created_at" true "$params")
  jq -r '.[] | "\(.created_at)  \(.email)"' <<<"$rows"
  count=$(jq 'length' <<<"$rows")
  echo "$count row(s) match email like '$E2E_EMAIL_LIKE'"
  [[ $count -gt 0 ]] || return 0
  if [[ $confirm != --yes ]]; then
    [[ -t 0 ]] || die "no TTY to confirm: rerun with --yes"
    read -r -p "Delete these $count row(s)? [y/N] " answer
    [[ $answer == [yY] ]] || die "aborted"
  fi
  mgmt_query "with deleted as (delete from kokode_ai.leads
    where email like \$1 returning 1) select count(*) as n from deleted" \
    false "$params" | jq -r '"deleted \(.[0].n) row(s)"'
}

cd "$ROOT"
task=${1:-}
shift || true
case "$task" in
  check) task_check "$@" ;;
  secrets) task_secrets ;;
  deploy) task_deploy ;;
  dev) task_dev ;;
  e2e) task_e2e ;;
  e2e-cleanup) task_e2e_cleanup "$@" ;;
  gh-vars) task_gh_vars ;;
  *)
    sed -n '2,14p' "${BASH_SOURCE[0]}" >&2
    exit 64
    ;;
esac
