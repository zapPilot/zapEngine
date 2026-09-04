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

Technical experiment priorities are numerically higher than the current default
rules, so a `default + experiment` run keeps canonical decisions first and lets
technical rules act as a lower-precedence additive layer.

Do not update the performance snapshot merely because these signals exist. A
future promotion into the default set is an intentional strategy behavior change
and must follow `ITERATION_PLAYBOOK.md`.

## Causal technical signal snapshot

Each asset's existing trailing `price_history` now derives:

- RSI(14) and five-day RSI slope
- annualized 20-day realized volatility
- 30-day and 90-day price momentum
- MACD(12, 26, 9), histogram, and bullish/bearish histogram crosses
- 20-day Bollinger z-score
- prior-20-day breakout / breakdown events
- bearish and bullish RSI divergence

The backtest engine appends the current day's price before strategy evaluation,
so these calculations use information available as of the decision date.

RSI divergence intentionally uses two trailing, already-observed windows rather
than a centered local-pivot detector. A centered pivot needs future bars to
confirm the peak/trough and would introduce look-ahead bias.

Long-lookback values remain `None` until enough history has accumulated. This PR
does not expand the canonical 14-day strategy warmup merely to prime research
indicators, because doing so could alter default state-machine behavior. Treat
the early portion of an experiment accordingly.

## Data-shape boundary

The current strategy context exposes close-price history, not a complete OHLCV
series. That is enough for RSI, momentum, realized volatility, MACD, Bollinger,
and close-price channel breaks. It is not enough to implement ATR, ADX,
Stochastic, OBV, or VWAP faithfully. Add those only after their required high,
low, and/or volume data is available; do not synthesize fake inputs just to make
an indicator exist.

## Non-default rule experiments

- `rsi_bearish_divergence_dca_sell`
- `rsi_overbought_dca_sell`
- `momentum_breakdown_dca_sell`
- `volatility_spike_dca_sell`
- `rsi_bullish_divergence_dca_buy`
- `rsi_oversold_recovery_dca_buy`
- `macd_bearish_cross_dca_sell`
- `macd_bullish_cross_dca_buy`
- `bollinger_upper_band_dca_sell`
- `bollinger_lower_band_dca_buy`
- `breakout_20d_dca_buy`
- `breakdown_20d_dca_sell`

Every technical-rule intent attaches a `technical_signals` diagnostic payload for
the triggering assets, including the exact RSI, momentum, volatility, MACD,
Bollinger, divergence, and channel-break values seen by that decision. This is
intended to make local attribution and behavior-trace review explainable.

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
