# Laya Direct-Allocation Research

This package is an **offline backtesting experiment**. It asks a Laya decision model to map the same historical market state used by analytics-engine into a portfolio allocation across:

- stable
- SPY
- BTC
- ETH

It is deliberately isolated from the production strategy registry, saved configs, API surface, and live execution paths. Nothing here registers a strategy or changes `dma_fgi_portfolio_rules`.

## Experiment shape

The runner compares five configs on one prepared historical dataset and one backtest engine invocation:

1. `dma_fgi_portfolio_rules` — canonical rule-based baseline.
2. `dca_classic` — frozen benchmark.
3. `laya_per_bucket_score_c1` — four parallel `score` questions, one per portfolio bucket.
4. `laya_posture_mixture_c1` — one `choice` question over five risk postures; calibrated probabilities are mixed into a target allocation.
5. `laya_static_equal_weight_c1` — model-free 25/25/25/25 control.

The two model-backed encodings use Laya's typed decision API. `per_bucket_score` defaults to the expected score from the returned probability distribution; `posture_mixture` uses the full returned posture probabilities instead of only the top choice.

Every decoded allocation is normalized and snapped to a 5 percentage-point grid. An unchanged target becomes HOLD rather than an artificial rebalance. Decision cadence is configurable; days outside the cadence also HOLD.

## Observation contract

`observation.py` builds a compact, deterministic, as-of-date state. It contains only information already available to the backtest on that date:

- crypto Fear & Greed value/regime/slope
- macro Fear & Greed value/label
- SPY/BTC/ETH distance from 200-DMA
- 7/30/90-day trailing returns where available
- realized volatility, RSI, and Bollinger z-score from the existing causal technical snapshot
- ETH/BTC distance from its 200-DMA
- current allocation
- previous Laya target

Absolute prices and dates are intentionally omitted. The serialized state has a hard character budget; the experiment raises instead of allowing silent model truncation.

## Reproducibility and isolation

- The Laya package lives in the `research` dependency group, not production dependencies.
- Importing the research modules does not import `laya`, `torch`, or `transformers`; the real model is loaded lazily only when `LayaHubClient` is instantiated.
- Model responses are cached as JSONL by a key that includes observation, questions, encoding version, model id, and device tag. Interrupted long runs can resume from completed decisions.
- A deterministic `FakeLayaClient` exercises the full backtest integration without model weights or network access.
- Reports include ROI, Sharpe, Sortino, Calmar, max drawdown, trade count, turnover, target diversity, model calls, and cache hits.

The canonical commands live in `src/services/backtesting/COMMANDS.md`.

## 2026-09-20 pinned-window result

The real `convaiinnovations/laya` English checkpoint was run on Apple MPS against the same 500-day production-history window as the pinned strategy snapshot. Both baselines reproduced the snapshot within the runner's guardrails.

| config | ROI % | Sharpe | Sortino | Calmar | Max DD % | trades | annualized turnover |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `dma_fgi_portfolio_rules` | 88.94 | 2.75 | 3.72 | 6.64 | -8.93 | 64 | 3.700 |
| `dca_classic` | -6.33 | -0.01 | -0.01 | -0.12 | -39.62 | 499 | 0.393 |
| `laya_per_bucket_score_c1` | 13.09 | 0.49 | 0.71 | 0.30 | -31.25 | 2 | 0.409 |
| `laya_posture_mixture_c1` | 16.16 | 0.72 | 1.10 | 0.56 | -20.88 | 127 | 6.117 |
| `laya_static_equal_weight_c1` | 12.21 | 0.46 | 0.67 | 0.27 | -32.48 | 1 | 0.333 |

The first result is negative evidence for replacing the canonical strategy: both Laya encodings materially underperformed the existing rule-based strategy on risk-adjusted and absolute returns. `posture_mixture` beat the equal-weight control on this window, while `per_bucket_score` was only slightly above it and collapsed to two distinct snapped targets.

Do not promote either encoding from this single in-sample historical comparison. A useful next experiment would vary decision cadence and checkpoint/encoding, then evaluate multiple disjoint or walk-forward windows before considering any product path.
