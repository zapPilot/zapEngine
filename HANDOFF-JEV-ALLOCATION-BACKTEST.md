# HANDOFF — JEV direct-allocation backtest experiment

## Status
Design-only handoff for a future backtesting experiment. No production or backtesting code has been implemented.
Working tree: this branch is intended to contain only this handoff file.

## Verified facts
- The current documented strategy is `dma_fgi_portfolio_rules` v1 and allocates across equities, BTC/ETH, and stablecoins using DMA/FGI-driven rules. [verified: apps/landing-page/content/docs/track-record/dma-fgi-portfolio-rules-v1.mdx:10-24]
- The current strategy evaluates each daily snapshot top-down and uses the first matching portfolio rule. [verified: apps/landing-page/content/docs/track-record/dma-fgi-portfolio-rules-v1.mdx:26-42]
- The canonical backtesting target-allocation model already has `btc`, `eth`, `spy`, `stable`, and `alt` buckets; target allocations must sum to 1.0 and cannot allocate to `alt`. [verified: apps/analytics-engine/src/models/backtesting.py:48-79]
- Backtesting already has an allocation-intent executor whose input is a target allocation rather than a buy/sell instruction. [verified: apps/analytics-engine/src/services/backtesting/execution/allocation_intent_executor.py:26-45,101-116]
- The current documented backtest includes configured gas, slippage, and protocol-fee assumptions. [verified: apps/landing-page/content/docs/track-record/dma-fgi-portfolio-rules-v1.mdx:51-60]

## Inventory
apps/landing-page/content/docs/track-record/dma-fgi-portfolio-rules-v1.mdx → examined; current rule-based baseline and risk limits; left unchanged.
apps/analytics-engine/src/models/backtesting.py → examined; canonical target-allocation contract; left unchanged.
apps/analytics-engine/src/services/backtesting/execution/allocation_intent_executor.py → examined; target-allocation execution boundary; left unchanged.
Implementation sites for a new JEV strategy → not examined exhaustively; this handoff is intentionally pre-implementation.

## Tests
- None added or changed. mutation: not run.

## Gates
- Unit/integration tests → [not run: design-only documentation change]
- Lint/typecheck/contracts → [not run: design-only documentation change]

## Decisions
- First experiment should let JEV output the portfolio target directly instead of predicting EF/F/N/G/EG and mapping that regime through another rule layer.
- Fixed output universe for v1: `stable`, `spy` (S&P 500 exposure), `btc`, `eth`; percentages must total 100%.
- Treat JEV as a stateless policy: every rebalance decision is based only on the observation assembled for that timestamp. Do not carry prior model reasoning/chat history forward.
- Historical information should primarily enter through timestamp-safe features rather than the complete raw price history: current price, 1d/7d/30d/90d returns, DMA levels/distances/slopes, volatility, drawdown, FGI current value and rolling/trend features. [assumed — exact first feature set still needs an experiment]
- Include current portfolio allocation and prior target in the observation so an unchanged target naturally represents HOLD and unnecessary turnover can be avoided.
- Keep decision and execution separate: JEV produces only a target allocation; the existing execution layer should remain responsible for calculating the trades needed to reach it.
- Start with 5-percentage-point allocation increments to reduce noisy micro-adjustments and make behavior easier to inspect. [assumed — must be compared against finer/continuous outputs]
- Run the JEV strategy against the existing DMA/FGI rule strategy under the same dates, initial capital, execution-cost assumptions, and data availability.
- Primary comparison should include return plus risk/behavior metrics such as CAGR/ROI, Sharpe, max drawdown, and turnover. [assumed — exact acceptance metric and thresholds are not yet chosen]
- Backtest observations must be point-in-time safe: no feature at timestamp T may depend on T+1 or later data.

## Scope
Deliberately out: implementation, provider/model selection, prompt tuning, production trading, Safe execution, and changing the existing rule strategy.
Not reached: feature-ablation runs, multiple JEV models, inference-cost accounting, continuous allocations, or live-paper-trading validation.

## Open questions
- What rebalance cadence should the first test use: daily, weekly, or only when selected inputs materially change?
- Which exact features are available historically with trustworthy timestamps, especially FGI/macro series?
- Should existing portfolio limits (for example stable minimum / asset concentration caps) remain hard constraints around JEV, or should the first research run expose the full 0–100% action space?
- What exact JEV model/version, temperature/sampling settings, and output-validation/retry policy make historical reruns reproducible?
- Should inference results be cached by observation hash so identical backtests never re-query the model?
- What baseline and acceptance criteria would justify progressing from research to paper trading?
