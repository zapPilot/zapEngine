#!/usr/bin/env bash
# scripts/resolve-deploy-matrix.sh
#
# Resolves which Fly.io apps to deploy and verify based on event context and
# the registry at .github/fly-apps.json. Called from .github/workflows/ci.yml
# (the deploy-gates.resolve step) but also locally testable.
#
# Required env vars:
#   EVENT_NAME     — 'push' | 'pull_request' | 'workflow_dispatch'
#   DEPLOY_TARGET  — 'all' | '<app-name>' (set on workflow_dispatch only;
#                    'frontend' is a valid option but produces no-op matrices
#                    since frontend deploys via Vercel, not this workflow)
#   PATHS_CHANGES  — JSON array from paths-filter like '["account-engine","frontend"]'
#                    Empty on workflow_dispatch events.
#
# Outputs (written to $GITHUB_OUTPUT when set, always echoed to stdout):
#   fly_matrix          — JSON array of registry entries whose app is in $changes
#   fly_verify_matrix   — Subset of fly_matrix where verify_docker is true
#
# Local testing:
#   EVENT_NAME=pull_request PATHS_CHANGES='["account-engine"]' bash scripts/resolve-deploy-matrix.sh
#   EVENT_NAME=workflow_dispatch DEPLOY_TARGET=all bash scripts/resolve-deploy-matrix.sh
#   EVENT_NAME=workflow_dispatch DEPLOY_TARGET=alpha-etl bash scripts/resolve-deploy-matrix.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGISTRY_FILE="$REPO_ROOT/.github/fly-apps.json"

if [ ! -f "$REGISTRY_FILE" ]; then
  echo "error: registry file not found at $REGISTRY_FILE" >&2
  exit 1
fi

# Compute the set of changed apps as a JSON array of strings.
if [ "${EVENT_NAME:-}" = "workflow_dispatch" ]; then
  case "${DEPLOY_TARGET:-}" in
    all)
      changes=$(jq -c '[.[].app]' "$REGISTRY_FILE")
      ;;
    "")
      echo "error: DEPLOY_TARGET must be set for workflow_dispatch events" >&2
      exit 1
      ;;
    *)
      changes=$(jq -cn --arg t "$DEPLOY_TARGET" '[$t]')
      ;;
  esac
else
  # paths-filter emits outputs.changes as a JSON array like ["frontend","alpha-etl"].
  # Default to [] when not provided.
  changes="${PATHS_CHANGES:-[]}"
fi

# Filter the registry by changed apps.
fly_matrix=$(jq -c --argjson changes "$changes" \
  '[.[] | select(.app as $a | $changes | index($a))]' "$REGISTRY_FILE")

# Subset: only apps that want Docker verification.
fly_verify_matrix=$(jq -c '[.[] | select(.verify_docker)]' <<<"$fly_matrix")

# Emit to both stdout (for CI log + local debug) and $GITHUB_OUTPUT (for step outputs).
{
  echo "fly_matrix=$fly_matrix"
  echo "fly_verify_matrix=$fly_verify_matrix"
} | tee -a "${GITHUB_OUTPUT:-/dev/null}"
