# Backtesting Strategy Iteration

This file is auto-loaded by Claude Code when working on backtesting strategies.
For historical iteration records, see [ITERATION_LOG.md](./ITERATION_LOG.md).
For the current rule-iteration gate, see
[ITERATION_PLAYBOOK.md](./ITERATION_PLAYBOOK.md).

If you are not working on strategy iteration, you can skip this file.

## Current Baseline

`dma_fgi_portfolio_rules` is the canonical rule-only baseline. It evaluates
portfolio rules first-match-wins by priority, applies risk guards, then executes
the final target atomically through `RuleBasedAllocationExecutor`.

Active default rules:

- `cross_down_exit`
- `cross_up_equal_weight`
- `eth_btc_ratio_rotation`
- `eth_btc_deviation_dca`
- `dma_overextension_dca_sell`
- `fgi_downshift_dca_sell`

Known non-default rules remain available for attribution diagnostics and
`enabled_rules` isolation, but are not eligible to fire in the default strategy
unless explicitly allowlisted.

## Known Retune Items

The following migrated rule is intentionally left as-is for this PR and should
be retuned in a later iteration:

- `spy_latch`: disabled in the default rule set pending flat-engine
  attribution.
- `extreme_fear_dca_buy`: remains disabled in the default rule set after the
  2026-05-13 size sweep. Standalone N=0/3/5/7 with default `buy_step=0.01` all
  trailed the disabled baseline (-1.03 to -0.05pp ROI). Increasing
  `buy_step` to 0.20 / 0.50 made it worse (-7.7 to -27.0pp). Decision-log
  trace shows the root cause is structural: BTC stays below DMA-200 during
  bear cycles, so any BTC bought during extreme-fear gets force-sold by
  `cross_up_equal_weight` when SPY (not BTC) crosses up. See `ITERATION_LOG.md`
  entry `2026-05-13`.

## Iteration Discipline

Before claiming a strategy change is done:

1. Run validation for each changed saved config:
   ```bash
   pnpm --filter @zapengine/analytics-engine exec uv run python scripts/analyze_compare.py \
     --saved-config-id <strategy_id> --from-date 2025-01-01 --to-date 2026-04-10 --summary
   ```
2. Add or update validation coverage in
   `tests/fixtures/hierarchical_validation_events.json` when behavior changes.
3. Regenerate the 500-day snapshot for intentional performance changes:
   ```bash
   pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/sweep_production_window.py --update-snapshot
   ```
4. Run `scripts/attribution/per_rule_report.py` against a fresh
   `decisions.jsonl` and attach match / win / shadowed counts to the log entry.
5. Run `scripts/attribution/rule_only_sweep.py` for any changed rule priority or
   trigger and attach standalone deltas.
6. Prepend an `ITERATION_LOG.md` entry with the strategy delta, validation
   coverage, per-rule diagnostics, and known follow-up items.

## Conventions

- The snapshot fixture is pinned to the 500-day production window ending
  `2026-04-15`.
- `StrategyRecipe` in [strategy_registry.py](./strategy_registry.py) is the
  public params source of truth. Do not add parallel strategy-id lists in
  `public_params.py`.
- `dma_fgi_portfolio_rules` is the only production backtesting strategy.

Operator commands are listed in [COMMANDS.md](./COMMANDS.md).
