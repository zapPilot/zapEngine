---
name: strategy-lab
description: Use to evaluate, compare, tune or explain a ZapEngine strategy spec (the DMA/FGI rule strategy) with the strategy-lab CLI; not for changing live behavior or the engine.
---

# Strategy lab

A strategy is one JSON spec. The lab runs a spec on pinned market data (a bundle) under the engine's honest assumptions and reports what it did and why. Everything goes through `pnpm --filter @zapengine/analytics-engine strategy-lab <command>`; from `apps/analytics-engine` drop the filter. Read `apps/analytics-engine/src/services/backtesting/COMMANDS.md` for every command and `src/config/strategies/VOCABULARY.md` for every field a spec can have.

## When to use it

- A question about how a strategy behaves: "what does rule X contribute", "where does it hold an asset below its average", "what happens if the cooldown is 21 days".
- Drafting a candidate spec and comparing it with the reference.

Do not use it to change what the product recommends today (that is a reviewed change to `src/config/strategies/reference/` with a version bump and a lock), to touch the engine or a rule kind (that is Python with tests and the generated vocabulary regenerated), or to run anything that needs production secrets. Recording a production bundle is an operator step.

## Iron rules

1. **Never edit a spec under `src/config/strategies/reference/` in place.** Candidates live in `apps/analytics-engine/.lab/candidates/` (`spec new` puts them there). `.lab/` is git-ignored and nothing in it is committed.
2. **Synthetic data is not evidence.** `synthetic:` bundles exercise code and pin behavior. A claim about performance needs a recorded production bundle, and the report's `warnings` say so when it does not have one.
3. **Parse the JSON envelope and the exit code, never the prose.** Every command prints one object `{command, ok, exit_code, result, warnings, artifacts}`. Exit codes: 0 done; 1 a gate failed (stale generated file, drifted or refused lock, a broken hard invariant); 2 the command does not apply to what it was given; 3 the spec is missing or invalid (`result.issues` points at each fault with a JSON pointer); 4 data or coverage is insufficient (a bundle is missing or corrupt).
4. **Read the data's coverage before trusting a result.** `bundle coverage <ref>` says what the data can support. When it says no holdout and no walk-forward, every number is descriptive.
5. **Say which bundle and which spec.** A report's `fingerprint` names the spec (`id@version#hash12`), the bundle's content hash, the evaluation settings and the code revision. Quote it.

## The quick loop

```bash
strategy-lab bundle coverage "synthetic:regimes?seed=1&days=400"   # or prod:latest when recorded
strategy-lab spec new --from reference/dma_fgi --id wider_cooldown   # candidate in .lab/candidates/
# edit the candidate; the schema is src/config/strategies/strategy-spec.schema.json
strategy-lab spec validate .lab/candidates/wider_cooldown.json       # exit 3 lists JSON pointers to fix
strategy-lab diff --base reference/dma_fgi --candidate .lab/candidates/wider_cooldown.json --bundle prod:latest
strategy-lab eval --spec .lab/candidates/wider_cooldown.json --bundle prod:latest
strategy-lab ablate --spec .lab/candidates/wider_cooldown.json --bundle prod:latest
```

`diff` is structural (rules are addressed by id, so moving a rule is one change) and, with a bundle, runs both specs on the same data and reports the first day their decisions differ. `eval` writes `report.json` and a 15-line `summary.txt` to `.lab/runs/<hash>/`. `ablate` is the leave-one-out table alone.

## How to read a report

Read in this order.

1. **`assumptions` first.** Fill lag, slippage and the stable APR are inputs to every number. Compare runs only under the same assumptions. `fill_lag_days: 0` and the other overrides exist to measure what an assumption costs, never to choose a strategy.
2. **`strategies` and `comparisons`.** ROI, max drawdown (negative; a lead of +10 pp is a drawdown ten points shallower), Sharpe over the stable APR, trades. The strategy is `strategy`; the benchmarks run on the same bars and assumptions.
3. **The PnL split.** `pnl_attribution` is price, yield and cost and sums to final value minus capital. A strategy whose edge is mostly yield or mostly cost is not the same as one whose edge is price.
4. **`attribution`.** Per rule: `matches` (its condition held), `wins` (it decided the day), `trades` (a win that moved money), `shadowed` (a higher-priority rule took a day it matched), `cooldown_skips` (its own cooldown held it back). `leave_one_out` is what the strategy loses without the rule: a positive `roi_pp` means the rule helps. Interactions matter: removing a rule lets lower rules fire.
5. **`invariants`.** Each is a count of days with examples. `weights_valid` is hard (a failure is an engine bug and exits 1); the rest are findings: `held_below_dma_days`, `buys_below_dma`, `proceeds_into_downtrend`, `cooldown_blocked_exits`, `stuck_in_stable`. The reference breaks several on purpose or by design; compare a candidate's counts with the reference's on the same bundle.
6. **`trace`** lists the days money moved, as compact decision-log lines. Use it to explain a number, not to find one.

## Tuning

Change one thing per candidate and keep the candidate's `id` descriptive. A change that moves the numbers on one bundle has not been shown to work: no walk-forward, holdout or promotion machinery exists yet, so report differences as observations with the bundle named. Do not tune on a window and then quote that window as proof.
