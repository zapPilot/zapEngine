# Coverage tooling

Configured workspaces own an absolute coverage floor in `vitest.config.ts`
(TypeScript) or `pyproject.toml` (Python). The separate GitHub `coverage` job
runs every workspace's `test:coverage` script; configured floors fail locally,
then the job publishes the reports available to the monorepo summary.

## Commands

| Command                 | Purpose                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| `pnpm coverage summary` | Run all coverage suites and write `coverage/summary.json`.              |
| `pnpm coverage test`    | Unit-test `coverage-summary.ts`.                                        |
| `pnpm test coverage`    | Run every workspace's `test:coverage` task without aggregating reports. |

analytics-engine uses the configured database URLs when present and otherwise
starts its managed local PostgreSQL backend. CI supplies its read-only and test
database URLs.

## Aggregate report

`scripts/coverage-summary.ts` discovers reports beneath both `apps/*` and
`packages/*`:

- Vitest workspaces emit `coverage/coverage-summary.json` via the
  `json-summary` reporter.
- analytics-engine emits pytest-cov Cobertura at `coverage.xml`; the aggregator
  also accepts `htmlcov/coverage.xml` as a fallback.

A complete sweep contains 13 workspaces:

```text
apps/account-engine
apps/alpha-etl
apps/analytics-engine
apps/app
apps/control-center
apps/desktop
apps/landing-page
apps/podcast-pipeline
packages/app-core
packages/brand-assets
packages/design-tokens
packages/intent-engine
packages/types
```

After a full run, verify completeness with:

```bash
pnpm exec tsx scripts/coverage-summary.ts
jq '.workspaces | length' coverage/summary.json # 13
```

## CI behavior

Coverage is a standalone GitHub job, parallel to the core quality jobs and
intentionally outside `pnpm verify ci`. The job has a 45-minute timeout, starts
PostgreSQL 15, uses the shared workspace setup action, and runs:

```bash
pnpm run coverage test
pnpm run coverage summary
```

The first command validates the aggregation script. The second runs
`turbo run test:coverage`, which enforces the absolute workspace floors below,
and then aggregates the 13 workspaces. CI uploads `coverage/summary.json` for
30 days and per-workspace HTML reports for seven days.

## Per-workspace absolute floors

| Workspace                | Statements | Branches | Functions | Lines |
| ------------------------ | ---------- | -------- | --------- | ----- |
| `apps/account-engine`    | 95         | 90       | 95        | 95    |
| `apps/alpha-etl`         | 92         | 92       | 92        | 92    |
| `apps/analytics-engine`  | —          | —        | —         | 95    |
| `apps/app`               | 64         | 67       | 68        | 65    |
| `apps/control-center`    | 77         | 66       | 78        | 78    |
| `apps/desktop`           | 85         | 80       | 85        | 85    |
| `apps/landing-page`      | 79         | 67       | 82        | 81    |
| `apps/podcast-pipeline`  | 91         | 80       | 92        | 92    |
| `packages/app-core`      | 75         | 66       | 73        | 76    |
| `packages/brand-assets`  | 95         | 90       | 100       | 95    |
| `packages/design-tokens` | —          | —        | —         | —     |
| `packages/intent-engine` | 90         | 85       | 90        | 90    |
| `packages/types`         | 90         | 85       | 90        | 90    |

- `apps/analytics-engine` has one canonical pytest-cov floor:
  `[tool.coverage.report] fail_under = 95` in `pyproject.toml`.
- `apps/app` was re-ratcheted on 2026-09-08 from a measured
  68.34/71.50/72.63/69.10 baseline, retaining roughly four points of churn
  buffer while reviewed-execution seam coverage is added.
- `packages/app-core` was re-ratcheted on 2026-09-08 from a measured
  79.71/70.58/77.91/80.86 baseline with the same buffer policy.
- `apps/landing-page` was re-ratcheted on 2026-09-08 from a measured
  83.87/71.97/87.31/85.72 baseline. `src/hooks/useMediaQuery.ts` and
  `src/hooks/useReducedMotion.ts` additionally enforce per-file floors of
  80/75/80/80.
- `packages/design-tokens` reports coverage for aggregation but has no absolute
  floor.
- `apps/control-center` was re-ratcheted on 2026-09-08 from a measured
  81.84/70.36/82.05/82.06 baseline, leaving roughly four points of normal
  feature-churn buffer.

Update this table whenever a workspace threshold changes. Ratchet floors upward
only after sustained coverage improvements; do not lower them to conceal a
regression.
