#!/usr/bin/env bash
# scripts/resolve-deploy-baseline.sh
#
# Resolves the commit an affected-only main push should diff against: the head
# SHA of the last *successful* push run of this workflow on main.
#
# Why not `github.event.before` (the default paths-filter base)? Because a main
# push run can be cancelled before it deploys. GitHub's default `queue: single`
# concurrency cancels a pending run when a newer one is queued, and main pushes
# land in bursts — on 2026-09-12 alone, twelve runs were cancelled within a
# minute of being created. Diffing against the immediately preceding commit
# would silently drop everything those runs would have deployed.
#
# The last successful run is the fleet's actual state: after it finished, every
# app matched its inputs at that SHA. Diffing S..HEAD therefore covers every
# commit since, however many runs in between were cancelled, gated out or
# failed mid-deploy. A run that does not succeed leaves S where it was, so the
# next push picks the work back up — which `queue: max` could not do.
#
# Required env vars:
#   GITHUB_REPOSITORY — 'owner/repo'
#   GITHUB_SHA        — the commit this run is building
#   GH_TOKEN          — token for `gh api` (github.token is enough: actions:read)
#   WORKFLOW_FILE     — workflow file name (default: ci.yml)
#
# Outputs (written to $GITHUB_OUTPUT when set, always echoed to stdout):
#   base_sha — 40-hex commit to pass to paths-filter as `base`
#
# Fails closed. Every failure mode stops the run at deploy-gates with nothing
# deployed, which is loud and self-healing: the next push to main tries again.
#
# Local testing:
#   GITHUB_REPOSITORY=zapPilot/zapEngine GITHUB_SHA=$(git rev-parse origin/main) \
#     bash scripts/resolve-deploy-baseline.sh

set -euo pipefail

WORKFLOW_FILE="${WORKFLOW_FILE:-ci.yml}"

for required in GITHUB_REPOSITORY GITHUB_SHA; do
  if [ -z "${!required:-}" ]; then
    echo "error: $required must be set" >&2
    exit 1
  fi
done

query="repos/${GITHUB_REPOSITORY}/actions/workflows/${WORKFLOW_FILE}/runs"
query="${query}?branch=main&event=push&status=success&per_page=1"

if ! response=$(gh api "$query" --jq '.workflow_runs[0].head_sha // ""' 2>&1); then
  echo "error: could not read workflow runs from $query" >&2
  echo "$response" >&2
  echo "note: converge the fleet manually with: gh workflow run ${WORKFLOW_FILE} -f deploy_target=all" >&2
  exit 1
fi

base_sha="$(printf '%s' "$response" | tr -d '[:space:]')"

if ! printf '%s' "$base_sha" | grep -Eq '^[0-9a-f]{40}$'; then
  echo "error: no successful main push run to diff against (got: '${base_sha}')" >&2
  echo "note: converge the fleet manually with: gh workflow run ${WORKFLOW_FILE} -f deploy_target=all" >&2
  exit 1
fi

# Re-running an old main run would otherwise diff backwards and roll the fleet
# onto a superseded image. Refuse instead: a stale run has nothing to deploy.
# Exit 128 (unknown object) is the same refusal — an unreachable baseline
# cannot be reasoned about either.
if ! git merge-base --is-ancestor "$base_sha" "$GITHUB_SHA" 2>/dev/null; then
  echo "error: baseline $base_sha is not an ancestor of $GITHUB_SHA" >&2
  echo "note: this run is behind the deployed fleet; re-run the newest main run instead." >&2
  exit 1
fi

echo "note: baseline $base_sha — diffing ${base_sha}..${GITHUB_SHA}" >&2
echo "base_sha=$base_sha" | tee -a "${GITHUB_OUTPUT:-/dev/null}"
