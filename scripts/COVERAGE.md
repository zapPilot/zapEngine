# Coverage tooling

Per-workspace test coverage is enforced by each workspace's own `vitest.config.ts`
(TS) or `pyproject.toml` (Python). On top of that, the monorepo has a
**no-regression gate**: a committed snapshot of "current best" coverage that
new PRs cannot drop below by more than 0.3 percentage points.

## Scripts

| Script                       | Purpose                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `pnpm coverage:summary`      | Run all coverage suites + aggregate into `coverage/summary.json`.             |
| `pnpm coverage:check`        | Run all coverage suites + exit 1 if any workspace regressed vs baseline.json. |
| `pnpm coverage:scripts:test` | Run the unit tests for `coverage-summary.ts` / `coverage-regression.ts`.      |

The aggregator walks `apps/*/coverage/coverage-summary.json` (vitest v8) and
`apps/analytics-engine/htmlcov/coverage.xml` (pytest-cov Cobertura). New
workspaces with a `coverage/coverage-summary.json` are discovered automatically.

## Regenerating the baseline (committed)

`coverage/baseline.json` is the floor that `pnpm coverage:check` enforces. Only
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
pnpm coverage:summary

# 4. Inspect coverage/summary.json — confirm every expected workspace is present.
jq '.workspaces[] | { name, lines: .lines.pct }' coverage/summary.json

# 5. Promote it to the committed baseline.
cp coverage/summary.json coverage/baseline.json

# 6. Commit. The .gitignore exception (line 49) allows `coverage/baseline.json`
#    through while keeping the rest of `coverage/` ignored.
git add coverage/baseline.json
git commit -m "chore(coverage): ratchet baseline to <date>"
```

## Adding the gate to CI

`pnpm coverage:check` is intentionally NOT part of `verify:ci` (frontend
sharded coverage alone is ~6 min). Wire it as a parallel job in
`.github/workflows/ci.yml`:

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
    - run: pnpm prebuild:packages
    - run: pnpm coverage:check
    - uses: actions/upload-artifact@v4
      if: always()
      with:
        name: coverage-summary
        path: coverage/summary.json
```

A drop greater than 0.3 pp in any workspace's `lines` coverage fails the job
with a markdown diff table in the run log.

## Per-workspace thresholds

In addition to the no-regression gate above, each workspace enforces its own
hard floor via vitest/pytest config:

| Workspace                | Statements       | Branches | Functions | Lines |
| ------------------------ | ---------------- | -------- | --------- | ----- |
| `packages/intent-engine` | 90               | 85       | 90        | 90    |
| `packages/types`         | 90               | 85       | 90        | 90    |
| `apps/account-engine`    | 90               | 85       | 90        | 90    |
| `apps/alpha-etl`         | 80               | 75       | 80        | 80    |
| `apps/frontend`          | 75               | 70       | 75        | 75    |
| `apps/podcast-pipeline`  | 75               | 70       | 75        | 75    |
| `apps/landing-page`      | 70               | 65       | 70        | 70    |
| `apps/analytics-engine`  | 95 line (pytest) |          |

These are aspirational starting floors. When `pnpm coverage:check` shows a
workspace consistently above its floor, ratchet the config-level threshold
up and update both this table and `coverage/baseline.json` in the same PR.
