---
name: monorepo-coverage-gate
description: 'Diagnose a failing GitHub coverage job or workspace test:coverage threshold without weakening the configured gate.'
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
absolute threshold. Add tests for the changed surface or delete dead code. Apply
a threshold exception only when explicitly authorized as described below. Aggregation never fails the
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
2. Keep the configured floor. Any experimental threshold exception must come
   from an explicit user decision or an applicable scoped repository policy;
   this skill grants no exception.
3. If such an exception is authorized, document its workspace scope, measured
   before/after coverage, and the agreed restoration condition in the PR.
4. Otherwise add meaningful coverage or remove genuinely dead code. Do not split
   the feature or change branch/worktree context without explicit user direction.

5. Do not use blanket `c8 ignore` to hide reachable code. Only ignore genuinely
   unreachable defensive branches, with a reason.

## Rationalizations — STOP

| Excuse                                                                              | Reality                                                                                           |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| "`verify ci` passed, so coverage is fine."                                          | Coverage is a separate GitHub job, not part of `verify ci`.                                       |
| "`pnpm coverage summary` is the same as CI."                                        | Almost — CI also runs `pnpm run coverage test` first. Compare with the workflow before debugging. |
| "Just lower the root threshold."                                                    | Keep the configured floor; this skill grants no threshold exception.                              |
| "The branch touched one workspace, so that workspace must be the coverage failure." | Coverage runs all workspaces; read the failed workspace line.                                     |
| "This production pipeline is large, so call it a POC and lower the floor."          | Durable production behavior must earn coverage; this skill does not authorize an exception.       |
| "Blanket-ignore deadcode and duplicates too; they are all from the same feature."   | Fix the underlying issues; do not suppress gates or split the task without authorization.         |
| "Blanket ignore the new dashboard."                                                 | Add high-value tests first; only ignore unreachable code with a reason.                           |

## Verification

For the current CI coverage job:

```bash
pnpm run coverage test
pnpm run coverage summary
```

Then push and read the GitHub `coverage` job. It can reveal the next workspace
only after the previous failing workspace floor is cleared.
