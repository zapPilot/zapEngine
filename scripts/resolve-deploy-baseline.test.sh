#!/usr/bin/env bash
# scripts/resolve-deploy-baseline.test.sh
# Regression lock for resolve-deploy-baseline.sh. Every case here is a way the
# baseline can be wrong, and a wrong baseline either skips a deploy or rolls
# the fleet backwards — so all of them must fail closed rather than guess.
#
# Run: bash scripts/resolve-deploy-baseline.test.sh
# CI parity: invoked as a deploy-gates local check. `gh` is stubbed, so this
# needs no network and no token.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/resolve-deploy-baseline.sh"

if [ ! -f "$SCRIPT" ]; then
  echo "error: script not found at $SCRIPT" >&2
  exit 1
fi

STUB_DIR="$(mktemp -d)"
trap 'rm -rf "$STUB_DIR"' EXIT

cat > "$STUB_DIR/gh" <<'STUB'
#!/usr/bin/env bash
if [ -n "${GH_STUB_EXIT:-}" ] && [ "${GH_STUB_EXIT}" != "0" ]; then
  echo "${GH_STUB_STDERR:-stub failure}" >&2
  exit "${GH_STUB_EXIT}"
fi
printf '%s\n' "${GH_STUB_SHA:-}"
STUB
chmod +x "$STUB_DIR/gh"

HEAD_SHA=$(git -C "$REPO_ROOT" rev-parse HEAD)
PARENT_SHA=$(git -C "$REPO_ROOT" rev-parse HEAD~1)

pass=0
fail=0

# Runs the script with the stub ahead of the real gh, and reports what it did.
run_case() {
  local label="$1" want_code="$2" want_base="$3"
  shift 3
  local out code=0
  out=$(env PATH="$STUB_DIR:$PATH" "$@" bash "$SCRIPT" 2>/dev/null) || code=$?
  local got_base=""
  if [ -n "$out" ]; then
    got_base=$(printf '%s' "$out" | grep '^base_sha=' | cut -d= -f2- || true)
  fi
  if [ "$code" = "$want_code" ] && [ "$got_base" = "$want_base" ]; then
    echo "  ✓ $label"
    pass=$((pass + 1))
  else
    echo "  ✗ $label"
    echo "    want: exit $want_code base_sha='$want_base'"
    echo "     got: exit $code base_sha='$got_base'"
    fail=$((fail + 1))
  fi
}

echo "resolve-deploy-baseline.sh regression tests"
echo ""

echo "[1] last successful run is an ancestor → that SHA is the base"
run_case "ancestor baseline" 0 "$PARENT_SHA" \
  GITHUB_REPOSITORY=zapPilot/zapEngine GITHUB_SHA="$HEAD_SHA" GH_STUB_SHA="$PARENT_SHA"

echo ""
echo "[2] this run is behind the deployed fleet → refuse"
# Re-running an old main run: deploying it would roll every matched app back.
run_case "descendant baseline" 1 "" \
  GITHUB_REPOSITORY=zapPilot/zapEngine GITHUB_SHA="$PARENT_SHA" GH_STUB_SHA="$HEAD_SHA"

echo ""
echo "[3] no successful main push run yet → refuse"
run_case "empty workflow_runs" 1 "" \
  GITHUB_REPOSITORY=zapPilot/zapEngine GITHUB_SHA="$HEAD_SHA" GH_STUB_SHA=""

echo ""
echo "[4] the API call itself failed → refuse, never fall back to a guess"
run_case "gh api failure" 1 "" \
  GITHUB_REPOSITORY=zapPilot/zapEngine GITHUB_SHA="$HEAD_SHA" GH_STUB_EXIT=1

echo ""
echo "[5] a non-SHA answer → refuse"
run_case "short sha" 1 "" \
  GITHUB_REPOSITORY=zapPilot/zapEngine GITHUB_SHA="$HEAD_SHA" GH_STUB_SHA="deadbeef"
run_case "null literal" 1 "" \
  GITHUB_REPOSITORY=zapPilot/zapEngine GITHUB_SHA="$HEAD_SHA" GH_STUB_SHA="null"
run_case "unknown object" 1 "" \
  GITHUB_REPOSITORY=zapPilot/zapEngine GITHUB_SHA="$HEAD_SHA" \
  GH_STUB_SHA="0000000000000000000000000000000000000000"

echo ""
echo "[6] missing required context → refuse"
run_case "no GITHUB_SHA" 1 "" \
  GITHUB_REPOSITORY=zapPilot/zapEngine GITHUB_SHA="" GH_STUB_SHA="$PARENT_SHA"
run_case "no GITHUB_REPOSITORY" 1 "" \
  GITHUB_REPOSITORY="" GITHUB_SHA="$HEAD_SHA" GH_STUB_SHA="$PARENT_SHA"

echo ""
echo "—"
echo "passed: $pass, failed: $fail"
if [ "$fail" -ne 0 ]; then
  exit 1
fi
echo "all resolve-deploy-baseline tests passed"
