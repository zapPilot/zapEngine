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

Coverage is intentionally NOT part of `verify ci` because frontend sharded
coverage takes about six minutes on its own. The parallel coverage job first
self-tests the coverage scripts with `pnpm run coverage test`, then runs every
workspace's coverage suite and aggregates the results with
`pnpm turbo run test:coverage && pnpm exec tsx scripts/coverage-summary.ts`:

```yaml
coverage:
  runs-on: ubuntu-latest
  timeout-minutes: 45
  services:
    postgres:
      image: postgres:15-alpine
      env:
        POSTGRES_USER: test_user
        POSTGRES_PASSWORD: testpass123
        POSTGRES_DB: test_db
      ports:
        - 5432:5432
      options: >-
        --health-cmd "pg_isready -U test_user"
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5
  env:
    TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
    TURBO_TEAM: ${{ vars.TURBO_TEAM }}
    TURBO_REMOTE_CACHE_SIGNATURE_KEY: ${{ secrets.TURBO_REMOTE_CACHE_SIGNATURE_KEY }}
    DATABASE_READ_ONLY: 'true'
    DATABASE_READ_ONLY_URL: ${{ secrets.DATABASE_READ_ONLY_URL }}
    TEST_DATABASE_URL: postgresql+psycopg://test_user:testpass123@localhost:5432/test_db
    DATABASE_INTEGRATION_URL: postgresql+asyncpg://test_user:testpass123@localhost:5432/test_db
  steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0

    - name: Enable corepack
      run: corepack enable && corepack prepare pnpm@10.30.3 --activate

    - uses: actions/setup-node@v4
      with:
        node-version: '24'
        cache: 'pnpm'

    - name: Install uv (for analytics-engine pytest-cov)
      uses: astral-sh/setup-uv@v5
      with:
        version: '0.8.13'
        enable-cache: true
        cache-dependency-glob: apps/analytics-engine/uv.lock

    - name: Cache Playwright browsers
      uses: actions/cache@v4
      with:
        path: ~/.cache/ms-playwright
        key: playwright-${{ runner.os }}-${{ hashFiles('apps/app/package.json', 'pnpm-lock.yaml') }}
        restore-keys: |
          playwright-${{ runner.os }}-

    - name: Install workspace dependencies
      timeout-minutes: 10
      run: pnpm install --frozen-lockfile

    - name: Self-test the coverage scripts
      run: pnpm run coverage test

    - name: Coverage summary (workspace thresholds)
      run: pnpm turbo run test:coverage && pnpm exec tsx scripts/coverage-summary.ts

    - name: Upload coverage summary artifact
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: coverage-summary
        path: coverage/summary.json
        if-no-files-found: warn
        retention-days: 30

    - name: Upload per-workspace HTML reports
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: coverage-html
        path: |
          apps/*/coverage/index.html
          apps/*/coverage/**/*.html
          packages/*/coverage/index.html
          packages/*/coverage/**/*.html
        if-no-files-found: ignore
        retention-days: 7
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
