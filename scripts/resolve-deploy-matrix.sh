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
#                    Empty on workflow_dispatch events.
#
# Outputs (written to $GITHUB_OUTPUT when set, always echoed to stdout):
#   deploy_matrix   — JSON array of registry entries to deploy
#   verify_matrix   — JSON array of registry entries to verify (Docker)
#
# Event semantics (fail-closed):
#   pull_request              → deploy_matrix=[], verify_matrix=changed apps where verify_docker
#   push + refs/heads/main    → deploy_matrix=changed apps, verify_matrix=[]
#   push + other ref          → deploy_matrix=[], verify_matrix=[]
#   workflow_dispatch all/app → deploy_matrix=requested, verify_matrix=[]
#
# A main push used to deploy every app at that SHA regardless of what changed,
# so the fleet converged on the newest green commit no matter which run got
# cancelled. The price was a full drain of the podcast render machine on every
# merge — including the merges that touched no Fly app at all — and a SIGINT to
# every in-flight ingest and TTS process on the app machine. Convergence is now
# carried by the diff base instead: ci.yml resolves PATHS_CHANGES against the
# last *successful* main push run, so a run that was cancelled, gated out or
# failed mid-deploy leaves that base where it was and the next push covers it.
#
# If a filter pattern misses a real input, the app stays on its old image until
# something else touches it. Recover with an explicit converge:
#   gh workflow run ci.yml -f deploy_target=all
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

changes="${PATHS_CHANGES:-[]}"
# Fail closed on a malformed filter output rather than silently resolving to an
# empty matrix: a paths-filter that broke would otherwise read as "nothing to
# deploy" on every push.
if ! jq -e 'type == "array" and all(.[]; type == "string")' <<<"$changes" >/dev/null 2>&1; then
  echo "error: PATHS_CHANGES must be a JSON array of strings, got: $changes" >&2
  exit 1
fi

# Registry order, not PATHS_CHANGES order, and names outside the registry
# (for example, a typo in a filter key) are ignored rather than invented.
changed_apps() {
  jq -c --argjson changes "$changes" \
    '[.[] | select(.app as $a | $changes | index($a))]' "$REGISTRY_FILE"
}

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
  # deploy_matrix stays empty on PR — PRs only verify; deploys happen on main push.
  deploy_matrix="[]"
  verify_matrix=$(changed_apps | jq -c '[.[] | select(.verify_docker)]')
elif [ "${EVENT_NAME:-}" = "push" ]; then
  if [ "${GITHUB_REF:-}" = "refs/heads/main" ]; then
    deploy_matrix=$(changed_apps)
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
  case "${EVENT_NAME:-}" in
    pull_request)
      echo "note: no Fly apps matched (changes=$changes) — empty deploy/verify matrix." >&2
      ;;
    push)
      if [ "${GITHUB_REF:-}" = "refs/heads/main" ]; then
        echo "note: main push changed no Fly app inputs (changes=$changes) — nothing to deploy." >&2
        echo "note: converge the fleet manually with: gh workflow run ci.yml -f deploy_target=all" >&2
      fi
      # a non-main push already logged its own note
      ;;
    workflow_dispatch) ;;
    *) ;; # unknown event already noted
  esac
fi

# Emit to both stdout (for CI log + local debug) and $GITHUB_OUTPUT (for step outputs).
{
  echo "deploy_matrix=$deploy_matrix"
  echo "verify_matrix=$verify_matrix"
} | tee -a "${GITHUB_OUTPUT:-/dev/null}"
