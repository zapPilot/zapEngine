#!/usr/bin/env bash
# scripts/check-dispatch-registry-drift.sh
#
# Asserts that .github/workflows/ci.yml's workflow_dispatch.options list stays
# in sync with .github/fly-apps.json.
#
# Uses yq (pre-installed on GitHub Actions ubuntu-latest runners, and universally
# available via `brew install yq` / `apt install yq` locally). No Python needed.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CI_PATH="$REPO_ROOT/.github/workflows/ci.yml"
REGISTRY_PATH="$REPO_ROOT/.github/fly-apps.json"

if ! command -v yq &>/dev/null; then
  echo "error: yq not found. On ubuntu-latest runners it is pre-installed." >&2
  echo "       Locally: brew install yq  (or: apt install yq / pip install yq)" >&2
  exit 1
fi

# Extract options array from ci.yml using yq.
# yq evaluates the `on:` key correctly (unlike Python+PyYAML which needs
# the `True` fallback for YAML 1.1 boolean shorthand).
actual=$(yq -r '.on.workflow_dispatch.inputs.deploy_target.options | join(",")' "$CI_PATH")
if [ "$actual" = "null" ] || [ -z "$actual" ]; then
  echo "error: could not read workflow_dispatch.inputs.deploy_target.options from ci.yml" >&2
  exit 1
fi

# Build expected set from the registry + the special 'all' value.
apps=$(yq -r '.[].app' "$REGISTRY_PATH" | sort | tr '\n' ',')
expected="all,${apps%,}"

# Compare sorted sets.
actual_sorted=$(echo "$actual" | tr ',' '\n' | sort | tr '\n' ',' | sed 's/,$//')
expected_sorted=$(echo "$expected" | tr ',' '\n' | sort | tr '\n' ',' | sed 's/,$//')

if [ "$actual_sorted" != "$expected_sorted" ]; then
  echo "workflow_dispatch.options drifted from .github/fly-apps.json:" >&2
  echo "" >&2
  echo "  actual (ci.yml):   $actual_sorted" >&2
  echo "  expected (merged): $expected_sorted" >&2
  echo "" >&2
  echo "Remedy: edit .github/workflows/ci.yml (workflow_dispatch.options)" >&2
  echo "        or .github/fly-apps.json to match." >&2
  exit 1
fi

echo "OK: workflow_dispatch.options matches registry"
