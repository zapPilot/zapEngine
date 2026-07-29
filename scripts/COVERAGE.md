# Coverage tooling

Per-workspace test coverage is enforced by each workspace's own `vitest.config.ts`
(TS) or `pyproject.toml` (Python). CI enforces those absolute thresholds and
publishes the aggregate summary. A separate baseline comparison remains
available for manual regression review, but it does not block CI.

## Scripts

| Script                  | Purpose                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| `pnpm coverage summary` | Run all coverage suites + aggregate into `coverage/summary.json`.             |
| `pnpm coverage check`   | Optional manual check: run all suites and compare against baseline.json.      |
| `pnpm coverage test`    | Run the unit tests for `coverage-summary.ts` / `coverage-regression.ts`.      |

The aggregator walks `apps/*/coverage/coverage-summary.json` (vitest v8) and
`apps/analytics-engine/htmlcov/coverage.xml` (pytest-cov Cobertura). New
workspaces with a `coverage/coverage-summary.json` are discovered automatically.

## Regenerating the baseline (committed)

`coverage/baseline.json` is the floor that `pnpm coverage check` enforces. Only
regenerate it when the team agrees to ratchet the floor up (e.g. after landing
a coverage improvement on `main`).

```bash
# 1. Make sure the env is set — analytics-engine's snapshot gate needs the
#    Supabase read-only replica.
export DATABASE_READ_ONLY_URL="postgresql://...read-only..."
# Optional:
# export DATABASE_INTEGRATION_URL=...    # alpha-etl integration suite
# export TEST_DATABASE_URL=...

# 2. Clean prior coverage outputs to avoid stale data.
pnpm clean   # or: turbo run clean

# 3. Run the full coverage sweep (~10–15 min cold, ~3 min warm).
pnpm coverage summary

# 4. Inspect coverage/summary.json — confirm every expected workspace is present.
jq '.workspaces[] | { name, lines: .lines.pct }' coverage/summary.json

# 5. Promote it to the committed baseline.
cp coverage/summary.json coverage/baseline.json

# 6. Commit. The .gitignore exception (line 49) allows `coverage/baseline.json`
#    through while keeping the rest of `coverage/` ignored.
git add coverage/baseline.json
git commit -m "chore(coverage): ratchet baseline to <date>"
```

## CI behavior

Coverage is intentionally NOT part of `verify ci` (the full coverage suite
is slow on its own). The parallel job in `.github/workflows/ci.yml` runs
`pnpm coverage summary`:

```yaml
coverage:
  runs-on: ubuntu-latest
  needs: [install]
  env:
    DATABASE_READ_ONLY_URL: ${{ secrets.DATABASE_READ_ONLY_URL }}
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with: { node-version: '24', cache: 'pnpm' }
    - run: pnpm install --frozen-lockfile
    - run: pnpm build packages
    - run: pnpm coverage summary
    - uses: actions/upload-artifact@v4
      if: always()
      with:
        name: coverage-summary
        path: coverage/summary.json
```

Each workspace's `test:coverage` command fails the job when its configured
absolute threshold is not met. Baseline drift alone does not fail CI; run
`pnpm coverage check` manually when a no-regression comparison is useful.

## Per-workspace thresholds

Each gated workspace enforces its own hard floor via vitest/pytest config
(`coverage.thresholds` in `vitest.config.ts`, or `[tool.coverage.report]
fail_under` in `pyproject.toml`):

| Workspace                | Statements | Branches | Functions | Lines |
| ------------------------ | ---------- | -------- | --------- | ----- |
| `packages/intent-engine` | 90         | 85       | 90        | 90    |
| `packages/types`         | 90         | 85       | 90        | 90    |
| `apps/account-engine`    | 95         | 90       | 95        | 95    |
| `apps/alpha-etl`         | 92         | 92       | 92        | 92    |
| `apps/podcast-pipeline`  | 91         | 80       | 92        | 92    |
| `apps/desktop`           | 85         | 80       | 85        | 85    |
| `apps/landing-page`      | 50         | 45       | 55        | 50    |
| `apps/analytics-engine`  | —          | —        | —         | 98    |

- `apps/landing-page`: the global floor is a temporary POC floor while the
  track-record dashboard is backfilled with tests (see the comment in its
  `vitest.config.ts`). `src/hooks/useMediaQuery.ts` and
  `src/hooks/useReducedMotion.ts` additionally carry per-file thresholds of
  80/75/80/80.
- `apps/analytics-engine`: pytest-cov enforces a single line-coverage floor —
  `fail_under = 98` under `[tool.coverage.report]` in `pyproject.toml` — used
  by `test:coverage` (the CI coverage job). `test:ci` separately passes an
  explicit `--cov-fail-under 95` to the same suite.

### Workspaces without a coverage floor

`apps/app` and `packages/design-tokens` run coverage (`test:coverage`) but
configure no thresholds, and `packages/app-core` has no coverage block at all
(and sets `passWithNoTests: true`). The coverage job can never fail these
workspaces on coverage — do not assume every workspace is gated.

Raise a config-level threshold when the team wants to make sustained
improvements mandatory, and update this table in the same PR.
