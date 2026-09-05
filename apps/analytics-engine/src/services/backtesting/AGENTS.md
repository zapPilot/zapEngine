See @../AGENTS.md for analytics-service boundaries.

# Backtesting strategy iteration

Historical iteration records live in [ITERATION_LOG.md](./ITERATION_LOG.md); the current operator workflow lives in [ITERATION_PLAYBOOK.md](./ITERATION_PLAYBOOK.md) and [COMMANDS.md](./COMMANDS.md). Keep changing operational steps there instead of duplicating them in agent context.

The non-default technical-indicator research surface is documented in [TECHNICAL_SIGNALS.md](./TECHNICAL_SIGNALS.md).

## Strategy isolation

- `RuleBasedPortfolioStrategy` uses the stable wire id `dma_fgi_portfolio_rules`; code identity and wire identity intentionally differ.
- Rule experiments (`enabled_rules`, `disabled_rules`, rule thresholds/priorities) belong only to the rule-based strategy.
- `dca_classic` is a frozen benchmark and must not start accepting rule-engine params.
- `StrategyRecipe` in `strategy_registry.py` is the public params source of truth. Do not create parallel strategy-id/params allowlists elsewhere.
- Keep benchmark/is-default distinctions in the existing registry/config metadata rather than introducing directory taxonomy solely for that distinction.

## Iteration discipline

For intentional strategy behavior changes:

1. Follow `ITERATION_PLAYBOOK.md` and run its behavioral and snapshot checks for the changed saved config.
2. Update `tests/fixtures/hierarchical_validation_events.json` when expected decision behavior changes.
3. Regenerate the strategy performance snapshot only when the performance change is intentional and verified against the configured read-only production-history source.
4. Record the result and diagnostics in `ITERATION_LOG.md`.

Do not make snapshot or validation fixtures green by weakening expectations without first demonstrating the intended strategy change.
