#!/usr/bin/env bash
# Validate the canonical schedule registry and its checked-in workflow claims.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGISTRY_PATH="$REPO_ROOT/.github/schedules.json"

for command in jq yq; do
  if ! command -v "$command" &>/dev/null; then
    echo "error: $command not found." >&2
    echo "       Locally: brew install $command  (or install it with your system package manager)." >&2
    exit 1
  fi
done

if ! jq -e '
  type == "array" and length > 0 and
  all(.[ ];
    type == "object" and
    (["name", "purpose", "schedule_kind", "schedule", "schedule_source", "runtime", "workspace", "entrypoint"] - keys | length == 0) and
    (keys - ["name", "purpose", "schedule_kind", "schedule", "schedule_source", "runtime", "workspace", "entrypoint", "endpoint", "docs"] | length == 0) and
    (.name | type == "string" and length > 0) and
    (.purpose | type == "string" and length > 0) and
    (.schedule_kind | IN("cron", "interval", "continuous")) and
    (.schedule | type == "string" and length > 0) and
    (.schedule_source | IN("workflow", "code", "external")) and
    (.runtime | IN("github-actions", "pipedream", "pg_cron", "fly-process", "local-mac", "electron")) and
    (.workspace | type == "string" and length > 0) and
    (.entrypoint | type == "string" and length > 0) and
    ((.endpoint? // "") | type == "string") and
    ((.docs? // "") | type == "string") and
    (.schedule_source != "workflow" or (.runtime == "github-actions" and .schedule_kind == "cron")) and
    (.runtime != "github-actions" or .schedule_source == "workflow")
  )
' "$REGISTRY_PATH" >/dev/null; then
  echo "error: .github/schedules.json is malformed or has missing/invalid fields." >&2
  echo "" >&2
  echo "Remedy: follow the field contract in docs/schedules.md." >&2
  exit 1
fi

duplicates=$(jq -r 'group_by(.name)[] | select(length > 1) | .[0].name' "$REGISTRY_PATH")
if [ -n "$duplicates" ]; then
  echo "schedule names must be unique:" >&2
  echo "$duplicates" | sed 's/^/  /' >&2
  echo "" >&2
  echo "Remedy: give every .github/schedules.json row a unique name." >&2
  exit 1
fi

while IFS= read -r path; do
  if [ ! -e "$REPO_ROOT/$path" ]; then
    echo "registry path does not exist: $path" >&2
    echo "" >&2
    echo "Remedy: fix or remove the stale entrypoint/docs path in .github/schedules.json." >&2
    exit 1
  fi
done < <(jq -r '.[] | .entrypoint, (.docs? // empty)' "$REGISTRY_PATH")

expected_workflows=$(mktemp)
actual_workflows=$(mktemp)
scheduled_workflow_names=$(mktemp)
alert_workflow_names=$(mktemp)
trap 'rm -f "$expected_workflows" "$actual_workflows" "$scheduled_workflow_names" "$alert_workflow_names"' EXIT

jq -r '
  .[]
  | select(.schedule_source == "workflow")
  | select(.runtime == "github-actions" and .schedule_kind == "cron")
  | [.entrypoint, .schedule]
  | @tsv
' "$REGISTRY_PATH" | sort > "$expected_workflows"

{
  while IFS= read -r workflow; do
    relative_path="${workflow#"$REPO_ROOT/"}"
    while IFS= read -r cron; do
      [ -n "$cron" ] && printf '%s\t%s\n' "$relative_path" "$cron"
    done < <(yq -r '.on.schedule[]?.cron // ""' "$workflow")
  done < <(find "$REPO_ROOT/.github/workflows" -maxdepth 1 -type f \( -name '*.yml' -o -name '*.yaml' \) | sort)
  true
} | sort > "$actual_workflows"

if ! diff -u "$expected_workflows" "$actual_workflows" >/dev/null; then
  echo "GitHub Actions cron schedules drifted from .github/schedules.json:" >&2
  echo "" >&2
  diff -u "$expected_workflows" "$actual_workflows" >&2 || true
  echo "" >&2
  echo "Remedy: update the workflow cron or its workflow-sourced registry row so both match." >&2
  exit 1
fi

{
  while IFS= read -r workflow; do
    yq -r 'select(.on.schedule != null) | .name' "$workflow"
  done < <(find "$REPO_ROOT/.github/workflows" -maxdepth 1 -type f \( -name '*.yml' -o -name '*.yaml' \) | sort)
  true
} | sed '/^null$/d; /^$/d' | sort -u > "$scheduled_workflow_names"

yq -r '.on.workflow_run.workflows[]' \
  "$REPO_ROOT/.github/workflows/cron-failure-alert.yml" \
  | sort -u > "$alert_workflow_names"

if ! diff -u "$scheduled_workflow_names" "$alert_workflow_names" >/dev/null; then
  echo "GitHub Actions cron failure alerts drifted from scheduled workflows:" >&2
  echo "" >&2
  diff -u "$scheduled_workflow_names" "$alert_workflow_names" >&2 || true
  echo "" >&2
  echo "Remedy: make cron-failure-alert.yml workflow_run names exactly match every scheduled workflow name." >&2
  exit 1
fi

external_count=$(jq '[.[] | select(.schedule_source == "external")] | length' "$REGISTRY_PATH")
echo "OK: GitHub Actions cron schedules match registry"
echo "OK: GitHub Actions cron workflows match failure alert subscriptions"
echo "note: $external_count schedules held externally — claims, not verified"
