---
name: monorepo-coverage-gate
description: >-
  Use when the coverage CI job fails or `pnpm coverage check` exits non-zero —
  "coverage for lines does not meet threshold", "workspace X regressed N pp vs
  baseline", a red `coverage` job while `verify ci` is green, or you're deciding
  whether to add tests, ignore a branch, or move the baseline. Covers the
  monorepo no-regression gate (`coverage-regression.ts`, baseline.json) and the
  per-workspace absolute floors (vitest.config / pyproject / mobile 30 /
  analytics-engine 95). Symptoms: regenerating baseline.json to make it pass,
  lowering a vitest/pyproject threshold, "verify ci passed so coverage is fine",
  blanket `c8 ignore` to dodge a failure.
---

# Monorepo coverage-gate debugging

## Where the error already is

**Not in `.ai-verify`.** Unlike the core gates, coverage is a *separate* CI job,
so it is **not** in `verify parallel`'s `result.json` / `logs/`. The entry point
is the no-regression gate `pnpm exec tsx scripts/coverage-regression.ts` and the
per-workspace `coverage/coverage-summary.json` (or the HTML report) — see below.

**Two false greens that fool an autonomous agent into stopping early.** Neither
validates the no-regression gate, yet both go green while CI stays red:

- `pnpm verify parallel` / `verify ci` — coverage is not in them (above).
- `pnpm --filter @zapengine/<pkg> test:coverage` **passing ≠ regression cleared.**
  The per-workspace floor sits far *below* the regression bar (this failure: the
  frontend run passes at 95.17% — the floor never fired — yet the regression bar
  is 95.86 − 0.5 = **95.36%**, so the gate is still red). A green per-workspace
  run says nothing here.

For an autonomous loop (opencode `/goal`): the **only** valid completion evidence
for a regression is `scripts/coverage-regression.ts` exiting 0. A green
per-workspace run or a green `verify parallel` is **not** evidence — do not emit
`[goal:complete]` on either.

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
   by more than each metric's tolerance — **lines 0.3, functions 0.5,
   branches 0.75** pp — in any workspace. The aggregator walks vitest
   `coverage/coverage-summary.json` + analytics-engine `htmlcov/coverage.xml`.
   - Message looks like: **"workspace W regressed … vs baseline"**
   - **The effective bar = `baseline pct − that metric's tolerance`, which is
     *higher* than the per-workspace absolute floor.** That gap is exactly why a
     passing per-workspace `test:coverage` does not clear this gate — never use
     one layer to verify the other.

**The coverage gate is NOT part of `verify ci`** (frontend sharded coverage alone
is ~6 min) — it's a **separate CI job**. A green `verify ci` tells you nothing
about coverage; reproduce the gate yourself (see *Reproduce locally* below).

> The authoritative reference for the tooling, the aggregator sources, and the
> baseline-regeneration procedure is
> [scripts/COVERAGE.md](../../../scripts/COVERAGE.md). This skill is the
> *debugging* layer on top of it.

## Fix — by layer

### No-regression gate dropped

The failure **names the workspace and metric**. Your target is concrete: get that
metric back to **`baseline pct − tolerance`** (read the baseline from
`coverage/baseline.json`; tolerances above). This failure: frontend `functions`
needs `≥ 95.86 − 0.5 = 95.36%` — aim for 95.86% to leave margin.

1. Regenerate + locate. Run the DB-free loop (see "Reproduce locally"), then list
   the cheapest functions to cover from the per-file summary:
   ```bash
   jq -r 'to_entries[] | select(.key!="total") | select(.value.functions.pct<100)
     | "\(.value.functions.total-.value.functions.covered)\t\(.key)"' \
     apps/frontend/coverage/coverage-summary.json | sort -rn | head -30
   ```
   (Swap `functions` for `lines`/`branches` to match the regressed metric.)
2. Add tests until the loop's `coverage-regression.ts` exits 0. Recurring real shapes:
   - a new provider/feature branch left untested (`e767e308`)
   - a test env var missing so a whole path under-covers — e.g. the WalletConnect
     project id the frontend Vitest/e2e env needs (`002a1457`, `d794c954`)
   - bulk backfill after a code-adding wave (`f5266ffa`)

The baseline may be **stale** — it ratchets up only occasionally, so a regression
is often accumulated drift, not your diff (this one: baseline 2026-05-23, +128
functions since). Don't hunt only for "code my change left uncovered" — **any**
covered function in the named workspace closes the gap. Pick the cheapest wins.

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

The gate today tracks only the **TS/vitest** workspaces in `coverage/baseline.json`
(frontend, intent-engine, types) — **no `DATABASE_READ_ONLY_URL` needed.** Run the
three steps directly; each is fast and DB-free:

```bash
# 1) Regenerate coverage for ALL baseline TS workspaces (turbo caches unchanged
#    ones). Regenerate ALL of them: rebuild only one and the aggregator drops the
#    rest, so step 3 reports them as "currentPct —" (a false regression).
pnpm turbo run test:coverage --filter='!@zapengine/mobile' --filter='!@zapengine/analytics-engine'

# 2) Re-aggregate → coverage/summary.json (pure file walk, no DB)
pnpm exec tsx scripts/coverage-summary.ts

# 3) The gate itself — pure compare of summary.json vs baseline.json (no DB, instant)
pnpm exec tsx scripts/coverage-regression.ts   # exit 0 == regression cleared
```

**Don't reach for `pnpm coverage check` on a TS-only regression.** Its `summary`
step runs `turbo run test:coverage --filter='!@zapengine/mobile'`, which drags in
analytics-engine; under `set -e` that can abort (it needs the DB) *before* the
regression check ever runs. Only when a regressed row names **`apps/analytics-engine`**
do you need `export DATABASE_READ_ONLY_URL=…` and the full `pnpm coverage check`.

## Rationalizations — STOP

| Excuse | Reality |
| --- | --- |
| "Just `cp coverage/summary.json coverage/baseline.json` and commit — gate passes." | Baseline only ratchets **up**, on main, by agreement. Absorbing your regression into it removes the floor. |
| "Lower the vitest/pyproject threshold a couple points." | Weakens the absolute floor for everyone. Add tests instead. |
| "`verify ci` is green, so coverage is fine." | Coverage is a **separate** CI job, not in `verify ci`. |
| "Wrap it in `c8 ignore` / `# pragma: no cover` and move on." | Only legitimate if the code is truly unreachable, with a stated reason. Prefer deleting dead code or writing the test. |
| "The whole monorepo coverage run is slow, I'll skip it." | You don't need it. Run the DB-free 3-step loop — one workspace's tests + two instant scripts. |
| "`pnpm --filter frontend test:coverage` passed, so coverage is fixed." | The per-workspace floor is far below the regression bar; that green says nothing about the regression. `coverage-regression.ts` exit 0 is the only proof. |
| "`pnpm coverage check` needs the DB and takes ~15 min, so I'll skip verifying." | A TS-workspace regression needs neither the DB nor the full sweep — run the 3-step loop. |
| "Workspace tests passed, emit `[goal:complete]`." | A coverage regression is done only when `coverage-regression.ts` exits 0 — not a per-workspace pass, not a green `verify parallel`. |

## Verification

- The authoritative local check is the DB-free 3-step loop ending in
  **`pnpm exec tsx scripts/coverage-regression.ts` exiting 0**. A green
  per-workspace `test:coverage` and a green `verify parallel` are **not** evidence.
- Only when `apps/analytics-engine` is among the regressed rows: `pnpm coverage
  check` exits 0 (with `DATABASE_READ_ONLY_URL` set).
- Push and read the CI **coverage** job (it stops at the first failing
  workspace; fixing one may reveal the next).
