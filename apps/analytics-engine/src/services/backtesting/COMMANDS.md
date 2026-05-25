# Backtesting Operator Commands

Most scripts require the API running:

```bash
pnpm --filter @zapengine/analytics-engine dev
```

## Snapshot

```bash
pnpm --filter @zapengine/analytics-engine test:strategy-snapshot
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/sweep_production_window.py
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/sweep_production_window.py --update-snapshot
```

## Validation

```bash
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/analyze_compare.py \
  --saved-config-id dma_fgi_portfolio_rules_default \
  --config-id dma_fgi_portfolio_rules_default \
  --from-date 2025-01-01 \
  --to-date 2026-04-10 \
  --format markdown
```

`analyze_compare.py` loads
`tests/fixtures/hierarchical_validation_events.json` by default and exits
non-zero when any selected constraint fails. Use `--constraint-event-id` for a
single fixture event and `--no-constraints` for diagnostics-only output.

## Fixed-Interval Rebalance experiments

Research-only strategy `fixed_interval_rebalance` (auto-excluded from the
500-day snapshot by its `[RESEARCH] ` display-name prefix). Compare the
production default against weight × interval combinations in one call:

```bash
curl -s -X POST http://localhost:8001/api/v3/backtesting/compare \
  -H 'Content-Type: application/json' \
  -d '{
    "token_symbol": "BTC",
    "total_capital": 10000,
    "start_date": "2024-04-15",
    "end_date": "2026-04-15",
    "configs": [
      {"config_id": "dma_default",            "saved_config_id": "dma_fgi_portfolio_rules_default"},
      {"config_id": "fir_balanced_30d",       "saved_config_id": "fixed_interval_balanced_30d"},
      {"config_id": "fir_conservative_30d",   "saved_config_id": "fixed_interval_conservative_30d"},
      {"config_id": "fir_aggressive_90d",     "saved_config_id": "fixed_interval_aggressive_90d"}
    ]
  }' | jq '.strategies | to_entries | map({config: .key, roi: .value.roi_percent, sharpe: .value.sharpe_ratio, max_dd: .value.max_drawdown_percent, trades: .value.trade_count})'
```

Drift-gated variant (only rebalances when max per-asset deviation ≥ 5 %):

```bash
curl -s -X POST http://localhost:8001/api/v3/backtesting/compare \
  -H 'Content-Type: application/json' \
  -d '{
    "token_symbol": "BTC", "total_capital": 10000,
    "start_date": "2024-04-15", "end_date": "2026-04-15",
    "configs": [
      {"config_id": "fir_calendar_only_7d",
       "strategy_id": "fixed_interval_rebalance",
       "params": {"interval_days": 7,
                  "target_weights": {"btc":0.25,"eth":0.25,"spy":0.25,"stable":0.25}}},
      {"config_id": "fir_drift_5pct_7d",
       "strategy_id": "fixed_interval_rebalance",
       "params": {"interval_days": 7, "min_drift_pct": 0.05,
                  "target_weights": {"btc":0.25,"eth":0.25,"spy":0.25,"stable":0.25}}}
    ]
  }' | jq '.strategies | to_entries | map({config: .key, roi: .value.roi_percent, trades: .value.trade_count})'
```

Single-preset diagnostics via the existing script:

```bash
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/analyze_compare.py \
  --saved-config-id fixed_interval_balanced_30d --config-id fir_balanced_30d \
  --from-date 2024-04-15 --to-date 2026-04-15 --format markdown --no-constraints
```

After running the sweep, prepend an `ITERATION_LOG.md` entry per
[ITERATION_PLAYBOOK.md](./ITERATION_PLAYBOOK.md) listing ROI / Sharpe /
Calmar / MaxDD / trade count vs `dma_fgi_portfolio_rules_default`.
