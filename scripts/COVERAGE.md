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

A complete sweep contains 14 workspaces:

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
packages/cost-observability
packages/design-tokens
packages/intent-engine
packages/types
```

After a full run, verify completeness with:

```bash
pnpm exec tsx scripts/coverage-summary.ts
jq '.workspaces | length' coverage/summary.json # 14
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
and then aggregates the 14 workspaces. CI uploads `coverage/summary.json` for
30 days and per-workspace HTML reports for seven days.

## Per-workspace absolute floors

| Workspace                     | Statements | Branches | Functions | Lines |
| ----------------------------- | ---------- | -------- | --------- | ----- |
| `apps/account-engine`         | 95         | 90       | 95        | 95    |
| `apps/alpha-etl`              | 92         | 92       | 92        | 92    |
| `apps/analytics-engine`       | —          | —        | —         | 95    |
| `apps/app`                    | 64         | 67       | 68        | 65    |
| `apps/control-center`         | 80         | 71       | 82        | 80    |
| `apps/desktop`                | 85         | 80       | 85        | 85    |
| `apps/landing-page`           | 83         | 75       | 89        | 84    |
| `apps/podcast-pipeline`       | 91         | 80       | 92        | 92    |
| `packages/app-core`           | 75         | 66       | 73        | 76    |
| `packages/brand-assets`       | 95         | 90       | 100       | 95    |
| `packages/cost-observability` | 100        | 100      | 100       | 100   |
| `packages/design-tokens`      | 100        | 100      | 100       | 100   |
| `packages/intent-engine`      | 90         | 85       | 90        | 90    |
| `packages/types`              | 90         | 85       | 90        | 90    |

- `apps/analytics-engine` has one canonical pytest-cov floor:
  `[tool.coverage.report] fail_under = 95` in `pyproject.toml`.
- `apps/app` was re-ratcheted on 2026-09-08 from a measured
  68.34/71.50/72.63/69.10 baseline, retaining roughly four points of churn
  buffer while reviewed-execution seam coverage is added.
- `packages/app-core` was re-ratcheted on 2026-09-08 from a measured
  79.71/70.58/77.91/80.86 baseline with the same buffer policy.
- `apps/landing-page` was re-ratcheted on 2026-09-14 after widening the
  denominator to include App Router code and exclude test-only helpers. The
  Node-24 measured baseline is 86.57/78.74/91.62/87.93, leaving roughly three
  points of churn buffer.
- `packages/cost-observability` and `packages/design-tokens` pin statements,
  branches, functions, and lines at 100% after exhaustive boundary coverage.
- `apps/control-center` was re-ratcheted on 2026-09-14 after adding an explicit
  production-source denominator. The measured baseline is
  83.03/74.30/85.09/83.07, leaving roughly three points of normal
  feature-churn buffer.

Update this table whenever a workspace threshold changes. Ratchet floors upward
only after sustained coverage improvements; do not lower them to conceal a
regression.
