# Technical signal experiments

## Intent

Treat `dma_fgi_portfolio_rules` as a strategy framework rather than a closed list
of indicators:

1. market data enters a stateful signal component,
2. the component emits typed per-asset market state,
3. ordered portfolio rules consume that state,
4. execution applies the selected allocation intent.

New research signals should normally extend the typed market state and add
non-default portfolio rules. They should not create a parallel strategy engine.

## Default-parity boundary

The technical indicators and rules in this document are additive research
capabilities. `DEFAULT_PORTFOLIO_RULES` remains unchanged. The new rules live in
`ALL_PORTFOLIO_RULES`, so they are addressable through `enabled_rules` without
changing the canonical default strategy until an experiment is explicitly
accepted.

Do not update the performance snapshot merely because these signals exist. A
future promotion into the default set is an intentional strategy behavior change
and must follow `ITERATION_PLAYBOOK.md`.

## Causal technical signal snapshot

Each asset's existing trailing `price_history` now derives:

- RSI(14)
- five-day RSI slope
- annualized 20-day realized volatility
- 30-day price momentum
- 90-day price momentum
- bearish RSI divergence
- bullish RSI divergence

The backtest engine appends the current day's price before strategy evaluation,
so these calculations use information available as of the decision date.

RSI divergence intentionally uses two trailing, already-observed windows rather
than a centered local-pivot detector. A centered pivot needs future bars to
confirm the peak/trough and would introduce look-ahead bias.

## Non-default rule experiments

- `rsi_bearish_divergence_dca_sell`
- `rsi_overbought_dca_sell`
- `momentum_breakdown_dca_sell`
- `volatility_spike_dca_sell`
- `rsi_bullish_divergence_dca_buy`
- `rsi_oversold_recovery_dca_buy`

Use `enabled_rules` to isolate one rule or compose it with selected existing
rules. Compare ROI, Sharpe, Calmar, max drawdown, trade count, and behavior-event
traces; do not promote a signal based on ROI alone.

## Local validation

Run the focused behavioral suite first:

```bash
pnpm --filter @zapengine/analytics-engine exec uv run pytest \
  tests/services/backtesting/signals/test_technical.py \
  tests/services/backtesting/portfolio_rules/test_technical_experiments.py
```

Then run the normal backtesting gate:

```bash
pnpm --filter @zapengine/analytics-engine exec uv run pytest \
  tests/test_validation_events.py \
  tests/services/backtesting

pnpm --filter @zapengine/analytics-engine test:strategy-snapshot:fast
```

The expected result for this PR is default snapshot parity. Performance movement
should occur only when a technical experiment rule is explicitly enabled.
