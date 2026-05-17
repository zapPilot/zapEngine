# Validation event fixtures

Backtesting validation-harness fixtures. Iteration discipline and the
snapshot/fixture workflow live in
[../../src/services/backtesting/CLAUDE.md](../../src/services/backtesting/CLAUDE.md).

## Gotcha: `applicable_strategies` and silent passes

When a validation event's expected behavior is specific to one strategy, set
`applicable_strategies` to that strategy id (e.g. `["dma_fgi_portfolio_rules"]`).
Omit it and the event runs against every strategy in `KEPT_STRATEGIES` (see
`../test_validation_events.py`); on strategies where the behavior does not apply
the assertions can pass vacuously, so a real regression goes undetected — a
silent green.
