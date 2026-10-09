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

`GET /api/v3/strategy/configs` lists these rules alongside every other
addressable rule name, each with `default_enabled: false` — the same treatment
`spy_latch` already gets. Being listed is what makes a rule addressable through
`enabled_rules`; it does not enable it.

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

Indicators read a fixed 260-bar trailing window (`TECHNICAL_LOOKBACK_BARS`), not
the entire run. The longest lookback here is 90 bars, and the recursive
indicators (Wilder RSI, MACD EMAs) converge to far below their decision
thresholds within that window, so a given calendar day's values do not depend on
when the backtest happened to start. The window also bounds the per-day cost
instead of letting it grow with the run length, and keeps a single unusable
close from blanking every later day.

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

## In a strategy spec

A strategy spec (`src/config/strategies/`, see `VOCABULARY.md`) writes the same
twelve rules as two kinds, `technical_trim` and `technical_add`, each with a
`trigger` that names the signal and states the level it fires at. Nothing is
defaulted, so a spec that uses `rsi_overbought_turning_down` says `rsi_at_least`
(the old rule used 70). The triggers are the conditions in
`portfolio_rules/technical_triggers.py`; the table below is the old rule names
written as spec rules (with the old default levels, a 7-day cooldown, a 0.05 step
and, for a trim, half of the proceeds into SPY):

| Old rule                          | Kind             | `trigger.signal`              | Levels                                            |
| --------------------------------- | ---------------- | ----------------------------- | ------------------------------------------------- |
| `rsi_bearish_divergence_dca_sell` | `technical_trim` | `rsi_bearish_divergence`      |                                                   |
| `rsi_overbought_dca_sell`         | `technical_trim` | `rsi_overbought_turning_down` | `rsi_at_least` 70                                 |
| `momentum_breakdown_dca_sell`     | `technical_trim` | `momentum_breakdown`          | `short_momentum_below` 0, `long_momentum_above` 0 |
| `volatility_spike_dca_sell`       | `technical_trim` | `volatility_spike`            | `thresholds` SPY 0.30, BTC 0.80, ETH 1.00         |
| `rsi_bullish_divergence_dca_buy`  | `technical_add`  | `rsi_bullish_divergence`      |                                                   |
| `rsi_oversold_recovery_dca_buy`   | `technical_add`  | `rsi_oversold_recovering`     | `rsi_at_most` 35                                  |
| `macd_bearish_cross_dca_sell`     | `technical_trim` | `macd_bearish_cross`          |                                                   |
| `macd_bullish_cross_dca_buy`      | `technical_add`  | `macd_bullish_cross`          |                                                   |
| `bollinger_upper_band_dca_sell`   | `technical_trim` | `bollinger_upper_band`        | `zscore_at_least` 2                               |
| `bollinger_lower_band_dca_buy`    | `technical_add`  | `bollinger_lower_band`        | `zscore_at_most` -2                               |
| `breakout_20d_dca_buy`            | `technical_add`  | `breakout_20d`                |                                                   |
| `breakdown_20d_dca_sell`          | `technical_trim` | `breakdown_20d`               |                                                   |

A rule listed after the default rules decides only on days they do not, exactly as
the old priorities ranked it. `tests/services/backtesting/spec/test_legacy_composition_parity.py`
builds the old `enabled_rules` combinations (each research rule on top of the
defaults and alone, the SPY latch, the trade quota guard, the greed multipliers)
and the equivalent specs, and requires the same strategy day by day. The levels are
tunable leaves, so `strategy-lab liveness` and `sweep` can move them; on the
synthetic histories every level of the rules that decide there changes some
decision. The `volatility_spike` levels the old rule shipped with are never
reached on them, so that rule's other fields show as dead until the levels are
lowered: that is the check doing its job.

## Local validation

The focused behavioral suite for these signals and rules:

```bash
pnpm --filter @zapengine/analytics-engine exec uv run pytest \
  tests/services/backtesting/signals/test_technical.py \
  tests/services/backtesting/signals/test_flat_minimum.py \
  tests/services/backtesting/portfolio_rules/test_technical_experiments.py
```

Run the repository-wide backtesting gate and the pinned production-window
snapshot from [COMMANDS.md](./COMMANDS.md); follow
[ITERATION_PLAYBOOK.md](./ITERATION_PLAYBOOK.md) before promoting an experiment
into the default set. While these rules stay non-default the expected result is
snapshot parity — performance should move only when a technical rule is
explicitly enabled.
