---
name: strategy-lab
description: Use to evaluate, compare, tune, promote or explain a ZapEngine strategy spec (the DMA/FGI rule strategy) with the strategy-lab CLI; not for changing live behavior directly or the engine.
---

# Strategy lab

A strategy is one JSON spec. The lab runs a spec on pinned market data (a bundle) under the engine's honest assumptions and reports what it did and why. Everything goes through `pnpm --filter @zapengine/analytics-engine strategy-lab <command>`; from `apps/analytics-engine` drop the filter. Read `apps/analytics-engine/src/services/backtesting/COMMANDS.md` for every command and `src/config/strategies/VOCABULARY.md` for every field a spec can have.

## When to use it

- A question about how a strategy behaves: "what does rule X contribute", "where does it hold an asset below its average", "what happens if the cooldown is 21 days".
- Drafting a candidate spec and comparing it with the reference.
- Weighing a candidate for promotion: whether the evidence clears the policy that decides if it may replace the reference.

Do not use it to change what the product recommends today (that is a reviewed change to `src/config/strategies/reference/` with a version bump and a lock, and only a `promote` verdict of promotable opens it), to touch the engine or a rule kind (that is Python with tests and the generated vocabulary regenerated), or to run anything that needs production secrets. Recording a production bundle is an operator step.

## Iron rules

1. **Never edit a spec under `src/config/strategies/reference/` in place.** Candidates live in `apps/analytics-engine/.lab/candidates/` (`spec new` puts them there). `.lab/` is git-ignored and nothing in it is committed.
2. **Synthetic data is not evidence.** `synthetic:` bundles exercise code and pin behavior. A claim about performance needs a recorded production bundle, and the report's `warnings` say so when it does not have one.
3. **Parse the JSON envelope and the exit code, never the prose.** Every command prints one object `{command, ok, exit_code, result, warnings, artifacts}`. Exit codes: 0 done; 1 a gate failed (stale generated file, drifted or refused lock, a broken hard invariant, a dead parameter, a failed promotion gate); 2 the command does not apply to what it was given; 3 the spec is missing or invalid (`result.issues` points at each fault with a JSON pointer); 4 data or coverage is insufficient (a bundle is missing or corrupt, a sweep has fewer than three walk-forward folds, a history has no days in the window, a promotion lacks evidence); 5 the holdout refuses (no new data yet, or the lineage has had its look).
4. **Read the data's coverage before trusting a result.** `bundle coverage <ref>` says what the data can support. When it says no holdout and no walk-forward, every number is descriptive.
5. **Say which bundle and which spec.** A report's `fingerprint` names the spec (`id@version#hash12`), the bundle's content hash, the evaluation settings and the code revision. Quote it.

## The quick loop

```bash
strategy-lab bundle coverage "synthetic:regimes?seed=1&days=400"   # or prod:latest when recorded
strategy-lab spec new --from reference/dma_fgi --id wider_cooldown   # candidate in .lab/candidates/
# edit the candidate; the schema is src/config/strategies/strategy-spec.schema.json
# a knob marked optional in VOCABULARY.md may be left out: leaving it out is its default behavior
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

## Which knobs matter

```bash
strategy-lab liveness --spec .lab/candidates/wider_cooldown.json --bundle prod:latest
strategy-lab liveness --spec .lab/candidates/wider_cooldown.json --bundle prod:latest --only /rules[cross_down_exit]
```

`liveness` perturbs every tunable leaf of the spec (the fields marked _(tunable)_ in `VOCABULARY.md`), down and up, runs each variant over the same bars and compares the decisions day by day. A leaf is `live` when some perturbation changes a decision on a `--bundle` history (`one_sided` when only one direction does: something else masks the other), `dormant` when only the stress histories show a difference (default: six synthetic stress seeds; `--stress` chooses), `dead` when nothing changes anywhere, and `unprobed` when every perturbation breaks the spec's own rules. A dead parameter exits 1: sweeping it searches nothing, so remove it or fix the spec. A dormant one matters only in rare conditions, so a sweep on ordinary history cannot tell its values apart; do not claim a finding about it. The same goes for a research rule (`technical_trim`, `technical_add`) that never decides on the history: its cooldown and step show as dead, and only its trigger levels, moved far enough, tell you it is connected. `days` says how many days each history ran: a verdict on a short history is a weak one.

## Searching a parameter space

```bash
strategy-lab sweep --spec .lab/candidates/wider_cooldown.json --bundle prod:latest --space .lab/spaces/cooldowns.json
strategy-lab sweep --spec .lab/candidates/wider_cooldown.json --reference reference/dma_fgi --bundle prod:latest --space .lab/spaces/cooldowns.json
```

By default the folds judge the best trial against `--spec` itself, which answers whether tuning helped. `--reference` judges it against another spec, and a promotion needs `reference/dma_fgi`, so that the folds answer whether the candidate beats the reference out of sample. A space file lists tunable pointers with `values`, or `min`/`max` (and `steps` for a grid), and a `sampling` block:

```json
{
  "parameters": [
    {
      "pointer": "/rules[cross_down_exit]/cooldown_days",
      "values": [15, 30, 60]
    },
    {
      "pointer": "/rules[dma_overextension_dca_sell]/sell_step",
      "min": 0.02,
      "max": 0.1,
      "steps": 5
    }
  ],
  "sampling": { "method": "grid", "trials": 50, "seed": 1 }
}
```

`grid` is every combination (at most 200); `random` and `halton` draw `trials` points. A pointer that is not a tunable leaf, or a value of the wrong type, exits 2 and lists the valid pointers. The sweep searches only the development window; the last 180 days are left for the holdout. Read the result in this order.

1. **`status`.** `insufficient_evidence` (exit 4) means fewer than three walk-forward folds fit, about 720 days of complete data. The answer is more data, not a looser sweep, and synthetic data does not substitute.
2. **`folds` and `aggregate`.** Each fold picks its best trial on the training days alone, then is judged against the reference on the next 90 days. `fold_win_rate` and `mean_oos_edge_pp` summarize those out-of-sample blocks (each fold also says how much deeper or shallower its drawdown was than the reference's); `oos_edge_annualized_pp` is a block-bootstrap interval of the edge, and an interval that includes zero is no evidence of an edge. `distinct_selected` says how stable the choice was: a different winner every fold means the parameter does not matter much.
3. **`plateau`.** The median score of the best trial's nearest neighbors over its own. Near 1 is a plateau; a small value is a spike that will not survive a small change.
4. **`deflated_sharpe`.** The probability the best trial's Sharpe beats what luck alone produces among that many candidates. `trials` is the number of distinct specs the ledger holds, so earlier attempts raise the bar. Closer to 1 is better.
5. **`best`** is the best of a search, chosen in sample. Never quote its ROI as the result.

## The holdout and the ledger

```bash
strategy-lab holdout init --lineage dma-cooldowns --bundle prod:latest
strategy-lab holdout status --lineage dma-cooldowns
strategy-lab holdout look --lineage dma-cooldowns --spec .lab/candidates/wider_cooldown.json --bundle prod:latest
strategy-lab ledger summary
strategy-lab ledger show --kind sweep --limit 5
```

A lineage is a family of candidates tuned on the same data. `holdout init` pins the last day of that data. `holdout look` is allowed once per lineage, and only after at least 90 new days have arrived since the pin; anything else exits 5 and is not retried with a different candidate, because the look belongs to the lineage, not to a candidate. The look is spent before anything is computed. It compares the candidate with `--reference` (default `reference/dma_fgi`) on the days after the pin and says nothing about whether the edge is enough: that is a promotion decision.

The ledger (`.lab/ledger.jsonl`) is append-only and local. It records every `eval`, `ablate`, `diff --bundle`, `liveness`, sweep trial and holdout step, because how many candidates were tried is itself a result: it sets the bar of the deflated Sharpe. Do not delete or edit it, and quote its `distinct_candidates` count when reporting a finding.

## Tuning

Change one thing per candidate and keep the candidate's `id` descriptive. Run `liveness` before a sweep, search only live parameters, and report the whole picture: the fold win rate, the interval, the plateau, the deflated Sharpe and how many candidates the ledger holds. A change that moves the numbers on one bundle has not been shown to work, and the best trial of a sweep is a hypothesis; the lineage's single holdout look is the test of it. Do not tune on a window and then quote that window as proof.

## Promotion

```bash
strategy-lab promote --spec .lab/candidates/wider_cooldown.json --bundle prod:latest --sweep 3f9a1c2b7d4e8a60 --lineage dma-cooldowns
strategy-lab promote --track structural --spec .lab/candidates/no_downshift.json --bundle prod:latest
```

`promote` asks one question: may this candidate replace the reference? On the default search track it reads the sweep (judged against `reference/dma_fgi`) and the lineage's single holdout look; on either track it runs four checks of its own on `--bundle` (dead parameters, hard invariants, the behavioral validation events, the golden pins), and measures each against `src/config/strategies/PROMOTION_POLICY.json`. Never edit the policy to make a candidate pass: its thresholds are changed by their own reviewed change.

Read `result.gates` in order. Each gate is `pass`, `fail` or `insufficient` with the number behind it and the threshold. A candidate is `promotable` only when every gate passes (exit 0). A `fail` (exit 1) rejects it and the gate says why; an `insufficient` (exit 4) means the evidence is not there yet (no sweep, fewer than three folds, no look taken), which is the honest state of most candidates until a production bundle covers about 720 days and 90 more have arrived. The policy refuses synthetic data outright (`real_data_only`), so on synthetic bundles the verdict can only be a rejection: that is correct, not a bug to route around.

A candidate that only simplifies the reference takes the structural track (`--track structural`): it removes rules, overlays, guards, optional parameters or list entries, or changes a categorical choice (an exit's `cooldown_scope`, where proceeds go), and moves no number at all. It brings no sweep and no lineage (either exits 2): the `structural_change` gate checks the change itself and names every pointer that makes it more than a simplification, and instead of folds and a look the candidate must not trail the reference on `--bundle` by more than the policy's margins, nor in the median over the policy's fixed synthetic suite. Tuning any number, even one, is the search track; do not split a tuning into a "structural" candidate to skip the sweep.

The command writes `.lab/promotions/<id>.json` (the whole decision) and prints an `ITERATION_LOG.md` entry in `result.log_entry`. A promotable verdict is the start of a pull request, not the end of one: bump `reference/dma_fgi.json` with a new `version`, `spec lock`, regenerate the golden pin, update the validation events and the performance snapshot, and paste the entry (`ITERATION_PLAYBOOK.md`). Do not promote by editing the reference without a promotable record, and do not run recordings or snapshot refreshes yourself: they need operator secrets.
