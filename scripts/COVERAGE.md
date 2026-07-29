# Coverage tooling

Each workspace owns its absolute coverage floor in `vitest.config.ts` (TypeScript)
or `pyproject.toml` (Python). The separate GitHub `coverage` job runs every
workspace's `test:coverage` script, so a workspace exits non-zero when one of
its configured floors is missed. The job then publishes a complete monorepo
summary; the optional baseline comparison remains a manual no-regression tool.

## Commands

| Command                 | Purpose                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| `pnpm coverage summary` | Run all coverage suites and write `coverage/summary.json`.              |
| `pnpm coverage check`   | Run the summary, then compare it with committed `baseline.json`.        |
| `pnpm coverage test`    | Unit-test `coverage-summary.ts` and `coverage-regression.ts`.           |
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

A complete sweep contains 11 workspaces:

```text
apps/account-engine
apps/alpha-etl
apps/analytics-engine
apps/app
apps/desktop
apps/landing-page
apps/podcast-pipeline
packages/app-core
packages/design-tokens
packages/intent-engine
packages/types
```

After a full run, verify completeness with:

```bash
pnpm exec tsx scripts/coverage-summary.ts
jq '.workspaces | length' coverage/summary.json # 11
```

## CI behavior

Coverage is a standalone GitHub job, parallel to the core quality jobs and
intentionally outside `pnpm verify ci`. The job has a 45-minute timeout, starts
PostgreSQL 15, uses the shared workspace setup action, and runs:

```bash
pnpm run coverage test
pnpm turbo run test:coverage
pnpm exec tsx scripts/coverage-summary.ts
```

The first command validates the aggregation and regression scripts. The Turbo
run enforces the absolute workspace floors below. The final command creates the
11-workspace aggregate. CI uploads `coverage/summary.json` for 30 days and
per-workspace HTML reports for seven days.

`scripts/coverage-regression.ts` is not part of the CI job. Baseline drift alone
does not fail CI; use `pnpm coverage check` when a manual no-regression
comparison is useful.

## Per-workspace absolute floors

| Workspace                | Statements | Branches | Functions | Lines |
| ------------------------ | ---------- | -------- | --------- | ----- |
| `apps/account-engine`    | 95         | 90       | 95        | 95    |
| `apps/alpha-etl`         | 92         | 92       | 92        | 92    |
| `apps/analytics-engine`  | —          | —        | —         | 95    |
| `apps/app`               | 57         | 61       | 60        | 58    |
| `apps/desktop`           | 85         | 80       | 85        | 85    |
| `apps/landing-page`      | 50         | 45       | 55        | 50    |
| `apps/podcast-pipeline`  | 91         | 80       | 92        | 92    |
| `packages/app-core`      | 53         | 42       | 46        | 54    |
| `packages/design-tokens` | —          | —        | —         | —     |
| `packages/intent-engine` | 90         | 85       | 90        | 90    |
| `packages/types`         | 90         | 85       | 90        | 90    |

- `apps/analytics-engine` has one canonical pytest-cov floor:
  `[tool.coverage.report] fail_under = 95` in `pyproject.toml`.
- `apps/app` floors come from the 2026-07-29 baseline
  (59.90/63.05/62.98/60.71), rounded down with a two-point buffer.
- `packages/app-core` floors come from the same baseline run
  (55.59/44.95/48.88/56.90), rounded down with a two-point buffer. Its test
  suite is populated even though Vitest retains `passWithNoTests: true`.
- `apps/landing-page` keeps a scoped temporary POC floor while the track-record
  dashboard is backfilled. `src/hooks/useMediaQuery.ts` and
  `src/hooks/useReducedMotion.ts` additionally enforce per-file floors of
  80/75/80/80.
- `packages/design-tokens` reports coverage for aggregation but has no absolute
  floor. Raise a config-level threshold when the team chooses to gate it.

Update this table whenever a workspace threshold changes. Ratchet floors upward
only after sustained coverage improvements; do not lower them to conceal a
regression.

## Manual no-regression baseline

`coverage/baseline.json` is the committed reference used only by
`pnpm coverage check`. Do not regenerate it to make a failing change pass.
Promote a new baseline only after the team agrees to ratchet it upward on
`main`.

```bash
# 1. Supply optional external database URLs, if needed.
# export DATABASE_READ_ONLY_URL="postgresql://...read-only..."
# export DATABASE_INTEGRATION_URL=...
# export TEST_DATABASE_URL=...

# 2. Run the full sweep (reporters overwrite their workspace outputs).
pnpm coverage summary

# 3. Confirm all expected workspaces and inspect their metrics.
jq '.workspaces | length' coverage/summary.json
jq '.workspaces[] | {name, lines: .lines.pct}' coverage/summary.json

# 4. Promote only an approved upward ratchet.
cp coverage/summary.json coverage/baseline.json
git add coverage/baseline.json
git commit -m "chore(coverage): ratchet baseline to <date>"
```
