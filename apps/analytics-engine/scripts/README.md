# Scripts

Developer utilities for the analytics-engine repo.

## Backtesting Utilities

### `hyperparam_sweep.py`

Grid search over Smart DCA backtesting parameters (including `rebalance_step_count`).
Runs the backtesting engine directly (faster than calling the API) and writes a CSV.

Example:

```bash
uv run python scripts/hyperparam_sweep.py \
  --token BTC \
  --days 365 \
  --jobs 4 \
  --out results/sweep_btc_1y.csv \
  --quick
```

### `run_sweep.sh`

Convenience wrapper for a default `hyperparam_sweep.py` run.

### `analyze_compare.py`

JSON-first compare analyzer that normalizes current and legacy payload shapes,
then renders focused strategy diagnostics for selected dates or ranges. Use this
for ETH/BTC rotation investigation, outer-DMA consistency checks, and
case-study style reports from large `/compare` payloads. Ad hoc
decision/execution/verify workflows now live as analyzer sections or internal
helpers under `scripts/backtesting/`.

Example:

```bash
python scripts/analyze_compare.py /tmp/backtest.json \
  --strategy-id eth_btc_rotation_default \
  --date 2025-04-22 \
  --profile eth-btc-rotation \
  --format markdown
```

### `run_backtest_policy_matrix.py`

Batch runner for DMA-first compare-v3 matrices. It calls the backtesting API,
saves raw JSON and summaries, and emits decision/execution diagnostics per
strategy config under `scripts/out/backtesting/` by default.

For built-in strategies, `--strategy-base-config` is canonicalized to the
nested public `params` contract used by compare-v3. Legacy flat built-in params
are still accepted and converted automatically.

Example:

```bash
python scripts/run_backtest_policy_matrix.py --days 500 --no-strict-verify
```

## CI / Tooling

### `audit_sql_params.py`

Verifies SQL parameter names follow `:snake_case`. Runs in pre-commit.

### `run-tests-precommit.sh`

Local/CI test runner. Provisions a PostgreSQL backend (Docker or local), applies
the integration schema/compat shims, then runs pytest.

### Integration Schema Helpers

- `bootstrap-integration-db.sql`
- `bootstrap-integration-db.sh`
- `sql/` (compatibility shims and extensions/roles)

## Migration Helpers

### `convert_tuple_patterns.py`

Migration tool for converting legacy tuple-based pattern rules to regex form.
