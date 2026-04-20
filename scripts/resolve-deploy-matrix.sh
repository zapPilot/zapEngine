#!/usr/bin/env bash
# scripts/resolve-deploy-matrix.sh
#
# Resolves which Fly.io apps to deploy and verify based on event context and
# the registry at .github/fly-apps.json. Called from .github/workflows/ci.yml
# (the deploy-gates.resolve step) but also locally testable.
#
# Required env vars:
#   EVENT_NAME     — 'push' | 'pull_request' | 'workflow_dispatch'
#   DEPLOY_TARGET  — 'all' | '<app-name>' | 'frontend' (set on workflow_dispatch only)
#   PATHS_CHANGES  — JSON array from paths-filter like '["account-engine","frontend"]'
#                    Empty on workflow_dispatch events.
#
# Outputs (to $GITHUB_OUTPUT if set, always echoed to stdout for logging):
#   fly_matrix          — JSON array of registry entries whose app is in $changes
#   fly_verify_matrix   — Subset of fly_matrix where verify_docker is true
#   frontend            — 'true' | 'false' (preserved for future consumers)
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

registry=$(cat "$REGISTRY_FILE")
event_name="${EVENT_NAME:-}"
deploy_target="${DEPLOY_TARGET:-}"
paths_changes="${PATHS_CHANGES:-}"

# Compute the set of changed apps as a JSON array of strings.
if [ "$event_name" = "workflow_dispatch" ]; then
  if [ "$deploy_target" = "all" ]; then
    changes=$(jq -cn --argjson r "$registry" '[$r[].app] + ["frontend"]')
  elif [ -n "$deploy_target" ]; then
    changes=$(jq -cn --arg t "$deploy_target" '[$t]')
  else
    echo "error: DEPLOY_TARGET must be set for workflow_dispatch events" >&2
    exit 1
  fi
else
  # paths-filter emits outputs.changes as a JSON array like ["frontend","alpha-etl"].
  # Default to [] when not provided (e.g., dispatch branch above or unset locally).
  changes="${paths_changes:-[]}"
fi

# Filter the registry by changed apps.
fly_matrix=$(jq -c \
  --argjson registry "$registry" \
  --argjson changes "$changes" \
  -n '[$registry[] | select(.app as $a | $changes | index($a))]')

# Subset: only apps that want Docker verification.
fly_verify_matrix=$(jq -c \
  --argjson matrix "$fly_matrix" \
  -n '[$matrix[] | select(.verify_docker)]')

# Frontend flag (Vercel handles the actual deploy; this is for future signalling).
frontend=$(jq -rn --argjson c "$changes" '($c | index("frontend")) != null')

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "fly_matrix=$fly_matrix"
    echo "fly_verify_matrix=$fly_verify_matrix"
    echo "frontend=$frontend"
  } >> "$GITHUB_OUTPUT"
fi

# Always log to stdout for both CI visibility and local debugging.
echo "fly_matrix=$fly_matrix"
echo "fly_verify_matrix=$fly_verify_matrix"
echo "frontend=$frontend"
