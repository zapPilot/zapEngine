---
name: monorepo-coverage-gate
description: >-
  Use when the separate GitHub `coverage` job fails, a workspace
  `test:coverage` exits non-zero, or coverage drops after adding a large POC
  surface. Covers the current CI coverage-summary job, per-workspace absolute
  Vitest/pytest/mobile floors, and the optional monorepo no-regression baseline
  scripts. Symptoms: `Coverage for lines/functions/statements/branches does not
  meet global threshold`, `workspace X regressed N pp vs baseline`, `verify ci`
  is green while the coverage job is red, lowering a global threshold, or
  regenerating `coverage/baseline.json` to hide a regression.
---

# Monorepo coverage-gate debugging

## Start from the actual failing layer

Coverage has multiple layers. Do not assume a red coverage job means the
no-regression script fired.

### Current GitHub `coverage` job

`.github/workflows/ci.yml` is authoritative — always copy the exact command and
filters from the workflow before debugging. It currently runs:

```bash
pnpm run coverage test
pnpm turbo run test:coverage --filter='!@zapengine/mobile' --filter='!@zapengine/desktop'
pnpm exec tsx scripts/coverage-summary.ts
```

That job enforces **per-workspace absolute floors** through each workspace's
`test:coverage` command. It does **not** currently run
`scripts/coverage-regression.ts` in CI. If the log says:

```txt
ERROR: Coverage for lines (...) does not meet global threshold (...)
Failed: @zapengine/<workspace>#test:coverage
```

then the failing layer is that workspace's `vitest.config.ts` / pytest / mobile
threshold, not the baseline regression gate.

### Root `pnpm coverage summary/check` caveat

`pnpm coverage summary` is a convenience script whose filters can drift from the
workflow's hand-written filters (e.g. which workspaces are excluded). It is not
guaranteed CI parity — when debugging CI, copy the command from the workflow
first.

## Core principle — fix coverage without hiding the blast radius

Coverage failures have two valid shapes:

1. **Absolute floor failure** — the workspace itself is below its configured
   threshold. Add tests for the changed surface, delete dead code, or make an
   explicitly scoped temporary threshold decision.
2. **No-regression failure** — `coverage-regression.ts` compares
   `coverage/summary.json` against `coverage/baseline.json`. Add tests until the
   script exits 0. Do not lower the baseline.

Never confuse these layers. A green per-workspace run does not prove the
regression gate is green, and a green regression script does not prove a
workspace absolute floor is green.

## Diagnose the failing workspace

1. Read the GitHub log. Capture the exact `Failed: @zapengine/<workspace>#test:coverage` line.
2. Re-run that workspace directly:

   ```bash
   pnpm turbo run test:coverage --filter=@zapengine/<workspace>
   ```

3. If you need CI parity for the whole current coverage job, run:

   ```bash
   pnpm turbo run test:coverage --filter='!@zapengine/mobile' --filter='!@zapengine/desktop'
   pnpm exec tsx scripts/coverage-summary.ts
   ```

4. Inspect the workspace's `coverage/coverage-summary.json` or HTML report and
   test the cheapest real functions/components first.

## Large POC / dashboard drops

A new dashboard or data accessor can drop a workspace from ~95% to ~50% because
`coverage.include` pulls in the whole new surface. Treat that as product debt,
not as a mysterious CI flake.

Preferred order:

1. Add smoke/unit tests for the highest-value pure functions, data mappers,
   validation helpers, and render paths.
2. If deploy is blocked and the feature is explicitly a POC, a temporary threshold
   reduction is acceptable only when all of these are true:
   - scoped to the affected workspace's `vitest.config.ts`, never repo-wide —
     other workspaces' floors stay untouched;
   - set just below the current measured coverage, with some tests added first;
   - documented with a `Temporary POC floor` comment;
   - not done by editing `coverage/baseline.json` downward;
   - followed by a separate task to ratchet the threshold back up.
3. Do not use blanket `c8 ignore` to hide reachable dashboard code. Only ignore
   genuinely unreachable defensive branches, with a reason.

## No-regression baseline gate

When `scripts/coverage-regression.ts` is actually the failing step, the target is
concrete: get the named workspace and metric back to
`baseline pct − tolerance` from `coverage/baseline.json`. Tolerances live in
`scripts/coverage-regression.ts` / `scripts/COVERAGE.md`.

Do not regenerate `coverage/baseline.json` to make a PR pass. The baseline is a
floor that should only ratchet upward on `main` by explicit team agreement.

Useful local loop for baseline regressions:

```bash
pnpm turbo run test:coverage --filter='!@zapengine/mobile' --filter='!@zapengine/desktop'
pnpm exec tsx scripts/coverage-summary.ts
pnpm exec tsx scripts/coverage-regression.ts
```

## Rationalizations — STOP

| Excuse | Reality |
| --- | --- |
| "`verify ci` passed, so coverage is fine." | Coverage is a separate GitHub job, not part of `verify ci`. |
| "Run `pnpm coverage check`; it's the same as CI." | Maybe not. First compare it with the workflow's exact command and filters. |
| "Just lower the root threshold / baseline." | That weakens the gate for everyone. Only scoped, temporary workspace floors are acceptable for explicit POCs. |
| "The branch touched desktop, so desktop coverage failed." | The current CI coverage job excludes `@zapengine/desktop`; read the failed workspace line. |
| "A green regression script means CI coverage is fixed." | Not if the workspace absolute floor failed before regression was even run. |
| "Blanket ignore the new dashboard." | Add high-value tests first; only ignore unreachable code with a reason. |

## Verification

For the current CI coverage job:

```bash
pnpm turbo run test:coverage --filter='!@zapengine/mobile' --filter='!@zapengine/desktop'
pnpm exec tsx scripts/coverage-summary.ts
```

If a no-regression check is part of the task or workflow, also run:

```bash
pnpm exec tsx scripts/coverage-regression.ts
```

Then push and read the GitHub `coverage` job. It can reveal the next workspace
only after the previous failing workspace floor is cleared.
