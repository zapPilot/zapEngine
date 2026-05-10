# Backtesting Strategy Iteration

This file is auto-loaded by Claude Code when working on backtesting strategies.
For historical iteration records, see [ITERATION_LOG.md](./ITERATION_LOG.md).

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
- `greed_sell_suppression`
- `dma_stable_gating`
- `spy_latch`
- `dma_overextension_dca_sell`
- `extreme_fear_dca_buy`
- `fgi_downshift_dca_sell`

`eth_btc_rotation` remains a saved-config-compatible BTC/ETH strategy, but it is
now also a rule wrapper over the shared portfolio-rule policy. Its BTC/ETH-only
rule set uses continuous ETH/BTC DMA-distance weighting instead of the
portfolio baseline's stepped ETH/BTC deviation DCA.

## Known Retune Items

The following migrated rules are intentionally left as-is for this PR and should
be retuned in a later iteration:

- `dma_stable_gating`: current flat trigger is too broad and has negative
  attribution.
- `greed_sell_suppression`: suppresses little useful behavior in the current
  flat priority order.
- `eth_btc_deviation_dca`: thresholds and symmetric ETH-to-BTC coverage need a
  fresh fixture pass.

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
4. Prepend an `ITERATION_LOG.md` entry with the strategy delta, validation
   coverage, and known follow-up items.

## Conventions

- The snapshot fixture is pinned to the 500-day production window ending
  `2026-04-15`.
- `StrategyRecipe` in [strategy_registry.py](./strategy_registry.py) is the
  public params source of truth. Do not add parallel strategy-id lists in
  `public_params.py`.
- `_minus_X` means leave-one-out attribution. `[RESEARCH]` strategies are
  excluded from default production snapshot checks.

Operator commands are listed in [COMMANDS.md](./COMMANDS.md).
