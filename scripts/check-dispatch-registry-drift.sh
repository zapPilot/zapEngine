#!/usr/bin/env bash
# scripts/check-dispatch-registry-drift.sh
#
# Asserts that .github/workflows/ci.yml's workflow_dispatch.options list stays
# in sync with .github/fly-apps.json.
#
# Why this exists:
#   GitHub Actions parses workflow_dispatch.inputs.*.options at workflow-parse
#   time, so the dropdown must be a literal YAML list — it cannot be generated
#   from the registry dynamically. This script catches the drift at PR time
#   when someone forgets to update one side.
#
# Expected options = {"all", "frontend"} ∪ {app names in .github/fly-apps.json}
#
# Usage:
#   bash scripts/check-dispatch-registry-drift.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

python3 - "$REPO_ROOT" <<'PY'
import json
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit(
        "error: PyYAML not installed. On ubuntu-latest runners it's pre-installed; "
        "locally, run: pip install pyyaml (or: python3 -m pip install --user pyyaml)"
    )

repo_root = Path(sys.argv[1])
ci_path = repo_root / ".github/workflows/ci.yml"
registry_path = repo_root / ".github/fly-apps.json"

ci = yaml.safe_load(ci_path.read_text())
registry = json.loads(registry_path.read_text())

# PyYAML parses unquoted `on:` as boolean True in YAML 1.1 mode, so `ci["on"]`
# may be a KeyError while `ci[True]` holds the real value. See
# https://github.com/yaml/pyyaml/issues/376 for the long story. Handle both
# cases so this script works across PyYAML versions and if GitHub ever
# normalizes the key.
on_block = ci.get("on") if isinstance(ci.get("on"), dict) else ci.get(True)
if not on_block:
    sys.exit("error: could not locate 'on' section in ci.yml")

try:
    actual = set(on_block["workflow_dispatch"]["inputs"]["deploy_target"]["options"])
except KeyError as err:
    sys.exit(f"error: workflow_dispatch.inputs.deploy_target.options missing: {err}")

expected = {entry["app"] for entry in registry} | {"all", "frontend"}

missing = expected - actual
extra = actual - expected

if missing or extra:
    lines = [
        "workflow_dispatch.options drifted from .github/fly-apps.json:",
    ]
    if missing:
        lines.append(f"  missing from ci.yml options:  {sorted(missing)}")
    if extra:
        lines.append(f"  extra entries in ci.yml:      {sorted(extra)}")
    lines.append("")
    lines.append("Remedy: edit .github/workflows/ci.yml (workflow_dispatch.options)")
    lines.append("        or .github/fly-apps.json to match.")
    sys.exit("\n".join(lines))

print(f"OK: workflow_dispatch.options matches registry ({sorted(actual)})")
PY
