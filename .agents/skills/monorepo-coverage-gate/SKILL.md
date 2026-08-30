---
name: monorepo-coverage-gate
description: >-
  Use when the separate GitHub `coverage` job fails, a workspace
  `test:coverage` exits non-zero, or coverage drops after adding a large POC
  surface. Covers the current CI coverage-summary job and the per-workspace
  absolute Vitest/pytest floors. Symptoms: `Coverage for
  lines/functions/statements/branches does not meet global threshold`, `verify
  ci` is green while the coverage job is red, or lowering a configured
  threshold to hide a regression.
---

# Monorepo coverage-gate debugging

## Current GitHub `coverage` job

`.github/workflows/ci.yml` is authoritative — always copy the exact command and
filters from the workflow before debugging. It currently runs:

```bash
pnpm run coverage test
pnpm run coverage summary
```

`pnpm coverage summary` is `turbo run test:coverage` followed by
`scripts/coverage-summary.ts`. That job enforces **configured per-workspace
absolute floors** through each workspace's `test:coverage` command. Workspaces
without thresholds do not fail an absolute floor, and only reporters that emit
`json-summary` enter the aggregate. If the log says:

```txt
ERROR: Coverage for lines (...) does not meet global threshold (...)
Failed: @zapengine/<workspace>#test:coverage
```

then the failing layer is that configured workspace's `vitest.config.ts` or
pytest threshold, not the aggregation step. `packages/design-tokens`
has no absolute floor. The aggregate contains 13 workspaces, including
`apps/control-center`.

## Core principle — fix coverage without hiding the blast radius

A coverage failure has one shape: the workspace is below its configured
absolute threshold. Add tests for the changed surface, delete dead code, or make
an explicitly scoped temporary threshold decision. Aggregation never fails the
job on its own — `coverage/summary.json` is a report, not a gate.

## Diagnose the failing workspace

1. Read the GitHub log. Capture the exact `Failed: @zapengine/<workspace>#test:coverage` line.
2. Re-run that workspace directly:

   ```bash
   pnpm turbo run test:coverage --filter=@zapengine/<workspace>
   ```

3. If you need CI parity for the whole current coverage job, run:

   ```bash
   pnpm run coverage summary
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
2. A temporary workspace threshold reduction is allowed only for an explicitly
   disposable POC or experiment. It is **not** an acceptable way to land a
   production pipeline, durable worker, schema migration, auth boundary, or
   invariant fix.
3. When the POC exception genuinely applies, all of these are required:
   - scoped to the affected workspace's `vitest.config.ts`, never repo-wide;
   - set just below the current measured coverage, with meaningful tests added first;
   - documented beside the threshold with a `Temporary POC floor` comment;
   - recorded in the PR body with before/after metrics and a concrete ratchet task;
   - not combined with blanket `knip`, `jscpd`, or coverage ignores to clear the
     same large feature surface.
4. If those conditions are missing, keep the threshold and either add coverage,
   remove dead surface, or split the feature so the uncovered portion cannot be
   mistaken for validated production code.
5. Do not use blanket `c8 ignore` to hide reachable code. Only ignore genuinely
   unreachable defensive branches, with a reason.

## Rationalizations — STOP

| Excuse                                                                              | Reality                                                                                                                   |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| "`verify ci` passed, so coverage is fine."                                          | Coverage is a separate GitHub job, not part of `verify ci`.                                                               |
| "`pnpm coverage summary` is the same as CI."                                        | Almost — CI also runs `pnpm run coverage test` first. Compare with the workflow before debugging.                         |
| "Just lower the root threshold."                                                    | That weakens the gate for everyone. Only scoped, temporary workspace floors are acceptable for explicit POCs.             |
| "The branch touched one workspace, so that workspace must be the coverage failure." | Coverage runs all workspaces; read the failed workspace line.                                                             |
| "This production pipeline is large, so call it a POC and lower the floor."          | Durable production behavior must earn coverage; the POC exception requires disposable scope and an explicit ratchet plan. |
| "Blanket-ignore deadcode and duplicates too; they are all from the same feature."   | Multiple gate suppressions hide an unreviewed surface. Fix or split it instead.                                           |
| "Blanket ignore the new dashboard."                                                 | Add high-value tests first; only ignore unreachable code with a reason.                                                   |

## Verification

For the current CI coverage job:

```bash
pnpm run coverage test
pnpm run coverage summary
```

Then push and read the GitHub `coverage` job. It can reveal the next workspace
only after the previous failing workspace floor is cleared.
