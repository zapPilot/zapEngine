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
