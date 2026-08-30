#!/usr/bin/env bash
# scripts/resolve-deploy-matrix.sh
#
# Resolves which Fly.io apps to deploy and verify based on event context and
# the registry at .github/fly-apps.json. Called from .github/workflows/ci.yml
# (the deploy-gates.resolve step) but also locally testable.
#
# Required env vars:
#   EVENT_NAME     — 'push' | 'pull_request' | 'workflow_dispatch'
#   GITHUB_REF     — git ref like 'refs/heads/main' or 'refs/pull/123/merge' (used for push)
#   DEPLOY_TARGET  — 'all' | '<app-name>' (set on workflow_dispatch only)
#   PATHS_CHANGES  — JSON array from paths-filter like '["account-engine","alpha-etl"]'
#                    Empty on workflow_dispatch events. Ignored on push/main.
#
# Outputs (written to $GITHUB_OUTPUT when set, always echoed to stdout):
#   deploy_matrix   — JSON array of registry entries to deploy
#   verify_matrix   — JSON array of registry entries to verify (Docker)
#
# Event semantics (fail-closed):
#   pull_request              → deploy_matrix=[], verify_matrix=changed apps where verify_docker
#   push + refs/heads/main    → deploy_matrix=ALL, verify_matrix=[]
#   push + other ref          → deploy_matrix=[], verify_matrix=[]
#   workflow_dispatch all/app → deploy_matrix=requested, verify_matrix=[]
#
# Note: paths-filter still runs on both PR and main push (for app_ios), but
# push deployments intentionally ignore PATHS_CHANGES — fleet converges to SHA.
#
# Local testing:
#   EVENT_NAME=pull_request PATHS_CHANGES='["podcast-pipeline"]' bash scripts/resolve-deploy-matrix.sh
#   EVENT_NAME=push GITHUB_REF=refs/heads/main PATHS_CHANGES='[]' bash scripts/resolve-deploy-matrix.sh
#   EVENT_NAME=workflow_dispatch DEPLOY_TARGET=all bash scripts/resolve-deploy-matrix.sh
#   EVENT_NAME=workflow_dispatch DEPLOY_TARGET=alpha-etl bash scripts/resolve-deploy-matrix.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGISTRY_FILE="$REPO_ROOT/.github/fly-apps.json"

if [ ! -f "$REGISTRY_FILE" ]; then
  echo "error: registry file not found at $REGISTRY_FILE" >&2
  exit 1
fi

deploy_matrix="[]"
verify_matrix="[]"

if [ "${EVENT_NAME:-}" = "workflow_dispatch" ]; then
  case "${DEPLOY_TARGET:-}" in
    all)
      deploy_matrix=$(jq -c '.' "$REGISTRY_FILE")
      verify_matrix="[]"
      ;;
    "")
      echo "error: DEPLOY_TARGET must be set for workflow_dispatch events" >&2
      exit 1
      ;;
    *)
      if ! jq -e --arg t "$DEPLOY_TARGET" 'any(.[]; .app == $t)' "$REGISTRY_FILE" >/dev/null; then
        valid=$(jq -r '([.[].app] + ["all"]) | unique | join(", ")' "$REGISTRY_FILE")
        echo "error: DEPLOY_TARGET '$DEPLOY_TARGET' is not a known app. Valid: $valid" >&2
        exit 1
      fi
      deploy_matrix=$(jq -c --arg t "$DEPLOY_TARGET" '[.[] | select(.app == $t)]' "$REGISTRY_FILE")
      verify_matrix="[]"
      ;;
  esac
elif [ "${EVENT_NAME:-}" = "pull_request" ]; then
  changes="${PATHS_CHANGES:-[]}"
  # deploy_matrix stays empty on PR — PRs only verify; deploys happen on main push.
  deploy_matrix="[]"
  verify_matrix=$(jq -c --argjson changes "$changes" \
    '[.[] | select(.app as $a | $changes | index($a)) | select(.verify_docker)]' "$REGISTRY_FILE")
elif [ "${EVENT_NAME:-}" = "push" ]; then
  if [ "${GITHUB_REF:-}" = "refs/heads/main" ]; then
    deploy_matrix=$(jq -c '.' "$REGISTRY_FILE")
    verify_matrix="[]"
  else
    # fail closed: non-main push never deploys or verifies
    deploy_matrix="[]"
    verify_matrix="[]"
    echo "note: push on non-main ref ${GITHUB_REF:-<empty>} — empty deploy/verify matrix." >&2
  fi
else
  # Unknown event — fail closed with empty matrices.
  deploy_matrix="[]"
  verify_matrix="[]"
  if [ -n "${EVENT_NAME:-}" ]; then
    echo "note: unknown EVENT_NAME '${EVENT_NAME}' — empty deploy/verify matrix." >&2
  fi
fi

if [ "$deploy_matrix" = "[]" ] && [ "$verify_matrix" = "[]" ]; then
  # Surface no-op without implying an error; include context for debugging.
  if [ "${EVENT_NAME:-}" = "pull_request" ]; then
    echo "note: no Fly apps matched (changes=${PATHS_CHANGES:-[]}) — empty deploy/verify matrix." >&2
  elif [ "${EVENT_NAME:-}" = "push" ] && [ "${GITHUB_REF:-}" != "refs/heads/main" ]; then
    : # already logged non-main push note
  elif [ "${EVENT_NAME:-}" != "workflow_dispatch" ] && [ "${EVENT_NAME:-}" != "push" ] && [ "${EVENT_NAME:-}" != "pull_request" ]; then
    : # unknown event already noted
  else
    echo "note: empty deploy/verify matrix (event=${EVENT_NAME:-<empty>} ref=${GITHUB_REF:-<empty>})." >&2
  fi
fi

# Emit to both stdout (for CI log + local debug) and $GITHUB_OUTPUT (for step outputs).
{
  echo "deploy_matrix=$deploy_matrix"
  echo "verify_matrix=$verify_matrix"
} | tee -a "${GITHUB_OUTPUT:-/dev/null}"
