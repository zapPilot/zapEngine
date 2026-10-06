#!/usr/bin/env bash
# Run a command with secrets from one of the two Infisical projects KOKODE uses.
#
#   scripts/infisical.sh kokode -- <cmd...>
#     KOKODE AI project (repo default, .infisical.json). KOKODE's own
#     credentials: SUPABASE_ACCESS_TOKEN (Supabase personal access token).
#
#   scripts/infisical.sh zap -- <cmd...>
#     Zap Pilot project -- owns the shared Supabase project. READ ONLY:
#     KOKODE only reads SUPABASE_URL from it. NEVER write to it
#     (`infisical secrets set`, dashboard edits, ...): zapEngine's env loader
#     fails on any key it does not declare.
#
# INFISICAL_ENV overrides the environment (default: prod).
# Project IDs are workspace identifiers, not secrets.
set -euo pipefail

KOKODE_PROJECT_ID="c9422b82-48af-4941-9660-fca70a351259"
ZAP_PROJECT_ID="572f3b7e-dd26-4f40-9695-df1a3d2d951b"

usage() {
  echo "usage: $0 <kokode|zap> -- <command...>" >&2
  exit 64
}

[[ $# -ge 3 && $2 == "--" ]] || usage
case "$1" in
  kokode) project_id=$KOKODE_PROJECT_ID ;;
  zap) project_id=$ZAP_PROJECT_ID ;;
  *) usage ;;
esac
shift 2

# Keep update notices out of captured stdout (`$(... printenv X)`).
export INFISICAL_DISABLE_UPDATE_CHECK=true
exec infisical run \
  --projectId="$project_id" \
  --env="${INFISICAL_ENV:-prod}" \
  --silent \
  --log-level=warn \
  -- "$@"
