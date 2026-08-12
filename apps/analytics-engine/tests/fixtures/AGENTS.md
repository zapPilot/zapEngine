# Validation event fixtures

Backtesting iteration workflow lives in [../../src/services/backtesting/AGENTS.md](../../src/services/backtesting/AGENTS.md).

## Silent-pass guardrail

When an expected behavior is specific to one strategy, set `applicable_strategies` to that strategy id. If it is omitted, the event runs against every strategy in `KEPT_STRATEGIES`; assertions can then pass vacuously on strategies where the behavior does not apply and hide a real regression.
