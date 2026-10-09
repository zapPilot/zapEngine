See @../AGENTS.md for analytics-service boundaries.

# Backtesting strategy iteration

Historical iteration records live in [ITERATION_LOG.md](./ITERATION_LOG.md); the current operator workflow lives in [ITERATION_PLAYBOOK.md](./ITERATION_PLAYBOOK.md) and [COMMANDS.md](./COMMANDS.md). Keep changing operational steps there instead of duplicating them in agent context.

The non-default technical-indicator research surface is documented in [TECHNICAL_SIGNALS.md](./TECHNICAL_SIGNALS.md).

## Strategy isolation

- `RuleBasedPortfolioStrategy` uses the stable wire id `dma_fgi_portfolio_rules`; code identity and wire identity intentionally differ.
- Rule experiments (`enabled_rules`, `disabled_rules`, rule thresholds/priorities) belong only to the rule-based strategy.
- `dca_classic` is a frozen benchmark and must not start accepting rule-engine params.
- `StrategyRecipe` in `strategy_registry.py` is the public params source of truth. Do not create parallel strategy-id/params allowlists elsewhere.
- A saved config is a recipe id plus validated params; `resolve_saved_strategy_config` in `strategy_registry.py` binds them. There is no component catalog or composition layer, and no staged-execution path (pacing, buy gate, execution plugins): each matched rule executes in full on its bar through `RuleBasedAllocationExecutor`.
- Keep benchmark/is-default distinctions in the existing registry/config metadata rather than introducing directory taxonomy solely for that distinction.

## Strategy specs

- A strategy spec (`src/config/strategies/**/*.json`, format `strategy-spec/1`) is declarative JSON validated by the models in `spec/`. The models are the single source of truth: `strategy-spec.schema.json` and `VOCABULARY.md` are generated from them (`pnpm strategy-lab schema`; `--check` fails on drift) and must not be edited by hand.
- Array order in `rules` is precedence. Nothing is defaulted, so a spec states everything the strategy does. A new rule kind, or a new knob on a kind, is Python in `spec/rules.py` and the rule class, with the generated artifacts regenerated in the same change.
- References (`reference/*.json`) are pinned in `LOCK.json` by version and behavior hash. A behavior change needs a new `version` and `pnpm strategy-lab spec lock <ref>`; the lock refuses to hide a change. A reference compiles to the same rule objects as the Python defaults and must reproduce the default strategy day by day (`tests/services/backtesting/spec/test_reference_parity.py`).

## Lab data

- Production market data never enters the repo. An operator records it into the git-ignored `.lab/bundles/` with `strategy-lab bundle record`, and a bundle is identified by its `content_sha256`; a result that depends on data names the bundle it ran on.
- Synthetic bundles exercise code and pin behavior. They are not evidence about how a strategy performs on real markets.
- Do not assume history exists: read a bundle's coverage first (`strategy-lab bundle coverage`). It says what the data can support, including when it cannot support a holdout.

## One strategy path

- The live daily suggestion is the last bar of `BacktestingService.replay_model`, which runs the saved config through the same compare path as the API and the published snapshot, over the same `MODEL_WINDOW_DAYS` window. A user's holdings only decide how far they are from that bar's target (`plan_transfers_to_target`).
- There must be no live-only strategy entrypoint, no per-request strategy rebuild, and no live-only copy of cooldown, quota or rule state. If a decision differs between live and compare, the fix is in the shared path, never in a second one. `tests/services/strategy/test_daily_suggestion_parity.py` is the guard.
- The user is asked to move only on a day the model itself traded (`action.required`); between signals the model holds, so asking would be noise.

## Honest assumptions

- A backtest number means nothing without its `BacktestAssumptions` (`fill_lag_days`, `slippage_rate`, `stable_apr`): they are an input to every run and are echoed on every response. An order fills `fill_lag_days` bars after the decision, only stablecoins earn yield, and each summary's `pnl_attribution` (price, yield, cost) sums to its total PnL.
- Tune and evaluate strategies under the defaults. `fill_lag_days=0` and the other overrides exist to measure what an assumption costs, never to pick a strategy.
- Copy that describes the backtest (landing, app, docs) states these assumptions; change them together, and re-baseline the published artifacts per `ITERATION_PLAYBOOK.md`.

## Iteration discipline

For intentional strategy behavior changes:

1. Follow `ITERATION_PLAYBOOK.md` and run its behavioral and snapshot checks for the changed saved config.
2. Update `tests/fixtures/hierarchical_validation_events.json` when expected decision behavior changes.
3. Regenerate the strategy performance snapshot only when the performance change is intentional and verified against the configured read-only production-history source.
4. Record the result and diagnostics in `ITERATION_LOG.md`.

Do not make snapshot or validation fixtures green by weakening expectations without first demonstrating the intended strategy change.
