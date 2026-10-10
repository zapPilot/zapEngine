See @../AGENTS.md for analytics-service boundaries.

# Backtesting strategy iteration

Historical iteration records live in [ITERATION_LOG.md](./ITERATION_LOG.md); the current operator workflow lives in [ITERATION_PLAYBOOK.md](./ITERATION_PLAYBOOK.md) and [COMMANDS.md](./COMMANDS.md). Keep changing operational steps there instead of duplicating them in agent context.

The non-default technical-indicator research surface is documented in [TECHNICAL_SIGNALS.md](./TECHNICAL_SIGNALS.md).

## Strategy isolation

- `RuleBasedPortfolioStrategy` uses the stable wire id `dma_fgi_portfolio_rules`; code identity and wire identity intentionally differ.
- What the rule-based strategy does is stated by its spec (`src/config/strategies/`) and only there: the rule classes have no defaults and no strategy takes params on the wire. A rule experiment is a candidate spec (`strategy-lab`), not a flag on the strategy; there is no `enabled_rules`/`disabled_rules`.
- `dca_classic` is a frozen benchmark and is not spec-backed.
- `StrategyRecipe` in `strategy_registry.py` is the registry of wire strategies. Do not create parallel strategy-id allowlists elsewhere.
- A saved config is a recipe id plus a `spec_ref` (a reference name pinned in `LOCK.json`); `resolve_saved_strategy_config` in `strategy_registry.py` binds them, and the registry checks every reference against the lock at import, so a behavior change without a version bump stops the service from starting. Responses and decision packets carry the identity `<name>@<version>#<hash12>` (`spec_ref()` in `spec/canonical.py`). There is no component catalog or composition layer, and no staged-execution path (pacing, buy gate, execution plugins): each matched rule executes in full on its bar through `RuleBasedAllocationExecutor`.
- Keep benchmark/is-default distinctions in the existing registry/config metadata rather than introducing directory taxonomy solely for that distinction.

## Strategy specs

- A strategy spec (`src/config/strategies/**/*.json`, format `strategy-spec/1`) is declarative JSON validated by the models in `spec/`. The models are the single source of truth: `strategy-spec.schema.json` and `VOCABULARY.md` are generated from them (`pnpm strategy-lab schema`; `--check` fails on drift) and must not be edited by hand.
- Array order in `rules` is precedence. Nothing is defaulted, so a spec states everything the strategy does. A new rule kind, or a new knob on a kind, is Python in `spec/rules.py` and the rule class, with the generated artifacts regenerated in the same change.
- A knob added to an existing kind after a reference was locked has a default that reproduces what the strategy did before, and the canonical form leaves a knob at its default out (`spec/canonical.py`), so adding a knob never changes the hash of a spec that does not use it. A knob that cannot have such a default is a new kind. The generated schema still asks for every field, so an author spells each knob out.
- Research rules are spec kinds too: `technical_trim` and `technical_add` take a `trigger` (a technical signal and the level it fires at; `TECHNICAL_SIGNALS.md`). A new signal is a trigger in `portfolio_rules/technical_triggers.py` and `spec/triggers.py`, with the generated artifacts regenerated in the same change.
- Behavior is also pinned DSN-free: `tests/fixtures/strategy_specs/golden_traces.json` holds digests of the reference, of a spec that uses every research kind, and of one that uses every knob and kind added after the reference was locked, each on six synthetic histories (`pnpm strategy-lab golden --check`). A refactor must leave it untouched; an intentional change regenerates it in the same commit, with the version bump and the reason, never to silence a refactor.
- References (`reference/*.json`) are pinned in `LOCK.json` by version and behavior hash. A behavior change needs a new `version` and `pnpm strategy-lab spec lock <ref>`; the lock refuses to hide a change. The registry builds the rule-based strategy from the reference itself (`strategy_registry.reference_spec`), so the reference is what production runs; `golden --check` and `tests/services/backtesting/test_engine_golden.py` pin its decisions day by day.

## Evaluating a strategy

Use `strategy-lab` (`COMMANDS.md`) and the agent skill `.agents/skills/strategy-lab/SKILL.md` to evaluate a candidate spec: `eval`, `ablate` and `diff` run it on a bundle and report what it did. Candidates live in the git-ignored `.lab/candidates/`; a reference is never edited in place. The numbers come from `execution/compare.py::simulate`, the one simulation path the API uses too; do not add a second.

## Searching a parameter space

- A search is `strategy-lab liveness` (is the knob connected to any decision?), then `sweep` (walk-forward folds with nested selection, a bootstrap interval, plateau retention and a Deflated Sharpe), then one `holdout look` per lineage. Fields a search may move carry `x-tunable` in the spec models; a parameter `liveness` finds dead is removed or fixed, not swept.
- Fewer than three folds is `insufficient_evidence`, never a result, and synthetic data does not substitute. The best trial of a sweep is chosen in sample and is not a finding.
- The ledger (`.lab/ledger.jsonl`) counts every candidate tried and sets the bar of the Deflated Sharpe. Never delete or rewrite it to improve a number; a finding that depends on it states its count.
- A holdout look belongs to the lineage and is spent once, after 90 new days. Do not look to check a candidate, and do not change a candidate after its look and ask again.

## Promoting a candidate

- A reference changes only through a promotion. `strategy-lab promote` weighs a candidate against `src/config/strategies/PROMOTION_POLICY.json` (real data only, the default assumptions, no dead parameter, the validation events and golden pins, the walk-forward folds judged against the production reference, the deflated Sharpe, and the lineage's single holdout look) and writes `.lab/promotions/<id>.json`. Only a `promotable` verdict opens the pull request that bumps `reference/dma_fgi.json`.
- The policy is the bar. Changing a threshold is a reviewed change of its own, never part of a promotion, and never done to make a candidate pass.

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
