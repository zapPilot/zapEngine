---
name: monorepo-coverage-gate
description: >-
  Use when the coverage CI job fails or `pnpm coverage:check` exits non-zero —
  "coverage for lines does not meet threshold", "workspace X regressed N pp vs
  baseline", a red `coverage` job while `verify:ci` is green, or you're deciding
  whether to add tests, ignore a branch, or move the baseline. Covers the
  monorepo no-regression gate (`coverage-regression.ts`, baseline.json) and the
  per-workspace absolute floors (vitest.config / pyproject / mobile 30 /
  analytics-engine 95). Symptoms: regenerating baseline.json to make it pass,
  lowering a vitest/pyproject threshold, "verify:ci passed so coverage is fine",
  blanket `c8 ignore` to dodge a failure.
---

# Monorepo coverage-gate debugging

## Core principle — two layers, don't conflate them

Coverage is enforced at **two independent layers**. Read the failure message to
know which one fired, because the fix differs.

1. **Per-workspace absolute floor** — each workspace's own config:
   - TS: `vitest.config.ts` `coverage.thresholds`
   - Python (analytics-engine): `test:ci` runs `--cov-fail-under 95` (a strict
     95% floor) plus the strategy-snapshot gate
   - mobile: `dart run tool/check_coverage.dart coverage/lcov.info 30` (30%)
   - Message looks like: **"Coverage for lines (X%) does not meet … threshold"**

2. **Monorepo no-regression gate** — [scripts/coverage-regression.ts](../../../scripts/coverage-regression.ts):
   a committed snapshot (`coverage/baseline.json`) that a PR may not drop below
   by more than **`REGRESSION_THRESHOLD_PP = 0.3`** percentage points, any
   workspace. The aggregator walks vitest `coverage/coverage-summary.json` +
   analytics-engine `htmlcov/coverage.xml`. Run via `pnpm coverage:check`.
   - Message looks like: **"workspace W regressed … vs baseline"**

**`pnpm coverage:check` is NOT part of `verify:ci`** (frontend sharded coverage
alone is ~6 min) — it's a **separate CI job**. A green `verify:ci` tells you
nothing about coverage; run the coverage job's command yourself.

> The authoritative reference for the tooling, the aggregator sources, and the
> baseline-regeneration procedure is
> [scripts/COVERAGE.md](../../../scripts/COVERAGE.md). This skill is the
> *debugging* layer on top of it.

## Fix — by layer

### No-regression gate dropped

You almost always **added code without tests**, so the workspace's percentage
fell. The failure **names the workspace** — that's where to look.

1. Reproduce just that workspace: `pnpm --filter @zapengine/<pkg> test:coverage`,
   then open `apps/<pkg>/coverage/coverage-summary.json` (or the HTML report) and
   find the **new** lines/branches your change left uncovered.
2. Add tests for that new code. Recurring real shapes:
   - a new provider/feature branch left untested (`e767e308`)
   - a test env var missing so a whole path under-covers — e.g. the WalletConnect
     project id the frontend Vitest/e2e env needs (`002a1457`, `d794c954`)
   - bulk backfill after a code-adding wave (`f5266ffa`)

**Do NOT regenerate `coverage/baseline.json` to make the gate pass.** The
baseline is a floor that only **ratchets up**, on `main`, by team agreement,
after a coverage *improvement* lands (see COVERAGE.md → "Regenerating the
baseline"). Lowering it to absorb your regression defeats the gate.

### Absolute floor not met

Same first move — add tests for the uncovered code. Only if the code is
**genuinely unreachable** (`465e66ef` "cover unreachable branches") do you
choose between:

- **Delete it** — dead code is the better fix, and it raises coverage for free.
- **Mark it ignored with a reason** — `/* c8 ignore next -- <why> */` (vitest v8)
  or `# pragma: no cover  # <why>` (pytest). A defensive `default:` / an
  unhittable error path qualifies; "I didn't want to write the test" does not.

**Never lower the configured threshold** to pass. That weakens the check for
every future PR, not just yours.

## Reproduce locally

```bash
# whole gate (analytics-engine needs the read-only replica; ~10–15 min cold)
export DATABASE_READ_ONLY_URL="postgresql://…read-only…"
pnpm coverage:check

# one workspace, fast inner loop
pnpm --filter @zapengine/<pkg> test:coverage   # then read coverage/coverage-summary.json
```

## Rationalizations — STOP

| Excuse | Reality |
| --- | --- |
| "Just `cp coverage/summary.json coverage/baseline.json` and commit — gate passes." | Baseline only ratchets **up**, on main, by agreement. Absorbing your regression into it removes the floor. |
| "Lower the vitest/pyproject threshold a couple points." | Weakens the absolute floor for everyone. Add tests instead. |
| "`verify:ci` is green, so coverage is fine." | Coverage is a **separate** CI job, not in `verify:ci`. |
| "Wrap it in `c8 ignore` / `# pragma: no cover` and move on." | Only legitimate if the code is truly unreachable, with a stated reason. Prefer deleting dead code or writing the test. |
| "The whole monorepo coverage run is slow, I'll skip it." | Run the single failing workspace's `test:coverage` — fast, and it's the one that regressed. |

## Verification

- Single workspace `test:coverage` shows your new lines covered.
- `pnpm coverage:check` exits 0 (set `DATABASE_READ_ONLY_URL` for the
  analytics-engine suite).
- Push and read the CI **coverage** job (it stops at the first failing
  workspace; fixing one may reveal the next).
