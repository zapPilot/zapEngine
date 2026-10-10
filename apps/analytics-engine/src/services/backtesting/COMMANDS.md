# Backtesting Operator Commands

## Snapshot

Drift check. Runs in-process against `TestClient(app)`, so it needs no server —
this is the variant CI and `pnpm test` run:

```bash
pnpm --filter @zapengine/analytics-engine test:strategy-snapshot:fast
```

The `sweep_production_window.py` invocations below drive the same sweep over
HTTP, so they require the API running in another shell:

```bash
pnpm --filter @zapengine/analytics-engine dev
```

```bash
pnpm --filter @zapengine/analytics-engine test:strategy-snapshot
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/sweep_production_window.py
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/sweep_production_window.py --update-snapshot
```

## Behavioral validation

```bash
pnpm --filter @zapengine/analytics-engine exec uv run pytest \
  tests/test_validation_events.py \
  tests/services/backtesting
```

## Strategy lab

Validate, hash and lock strategy specs, and export their schema. No secrets are needed.

Every command prints one JSON envelope, `{command, ok, exit_code, result, warnings, artifacts}`. For a failed command `result` carries `code`, `message` and `issues`, and each issue points at the fault with a JSON pointer. Exit codes:

- 0: done.
- 1: a gate failed (a generated artifact or a lock is out of date, a lock would hide a behavior change, a hard invariant is broken, `liveness` found a dead parameter, or a promotion gate failed).
- 2: the command does not apply to what it was given, or a usage error (a search space that does not fit the spec, a lineage name that is not a slug).
- 3: the spec is missing or invalid.
- 4: data or coverage is insufficient (a bundle is missing or corrupt, a sweep has fewer than three walk-forward folds, a history has no days in the window, the ledger is damaged, a promotion lacks evidence).
- 5: a holdout request was refused (the lineage is not pinned, has had its look, or lacks 90 new days).

```bash
pnpm --filter @zapengine/analytics-engine strategy-lab spec validate reference/dma_fgi
pnpm --filter @zapengine/analytics-engine strategy-lab spec hash reference/dma_fgi --canonical
pnpm --filter @zapengine/analytics-engine strategy-lab spec lock reference/dma_fgi
pnpm --filter @zapengine/analytics-engine strategy-lab schema          # regenerate the schema and VOCABULARY.md
pnpm --filter @zapengine/analytics-engine strategy-lab schema --check  # fail if they are stale
```

### Data bundles

A bundle is the pinned market data a strategy is evaluated on: the rows the compare path consumes, a manifest (source, window, data requirements, coverage) and a content hash, in a gzip file under `apps/analytics-engine/.lab/bundles/<name>/` (git-ignored). A reference is `name:latest`, `name:<id>`, a bundle path, or `synthetic:<regimes|stress>?seed=N&days=N`. Synthetic data exercises code and pins behavior; it is never evidence about real markets.

Recording is the only lab step that reads production, so an operator runs it with the environment runner. It refuses unless the service is read-only, takes the same prepared window the compare path takes, and never overwrites a bundle. `--dry-run` prints the coverage without writing.

```bash
node scripts/env/run.mjs --environment prod -- pnpm --filter @zapengine/analytics-engine strategy-lab bundle record --name prod --start 2017-01-01
pnpm --filter @zapengine/analytics-engine strategy-lab bundle coverage prod:latest
pnpm --filter @zapengine/analytics-engine strategy-lab bundle coverage "synthetic:regimes?seed=1&days=400"
```

Coverage lists, per series, where it starts and ends and its longest gap; the longest stretch where every series the strategy needs is present; and what that stretch can support (a holdout, walk-forward folds, or only a descriptive run). It does not assume history exists: the production database's complete-feature history starts in 2025-04.

### Evaluating a spec

`eval` runs a spec on a bundle through the same simulation the compare API uses, together with its leave-one-out variants and the benchmarks (`dca_classic`, `buy_hold_btc`, `buy_hold_equal_weight`), over the same bars and assumptions. It writes `report.json` and a 15-line `summary.txt` to `.lab/runs/<hash>/` and prints the report (without the trace) in the envelope. Exit code 1 means a hard invariant is broken, which is an engine fault, not a strategy finding. Candidates live in `.lab/candidates/`; nothing under `.lab/` is committed.

```bash
pnpm --filter @zapengine/analytics-engine strategy-lab spec new --from reference/dma_fgi --id my_candidate
pnpm --filter @zapengine/analytics-engine strategy-lab spec validate .lab/candidates/my_candidate.json
pnpm --filter @zapengine/analytics-engine strategy-lab diff --base reference/dma_fgi --candidate .lab/candidates/my_candidate.json --bundle prod:latest
pnpm --filter @zapengine/analytics-engine strategy-lab eval --spec .lab/candidates/my_candidate.json --bundle prod:latest
pnpm --filter @zapengine/analytics-engine strategy-lab ablate --spec .lab/candidates/my_candidate.json --bundle prod:latest
pnpm --filter @zapengine/analytics-engine strategy-lab bundle synth --scenario stress --seed 2 --days 400
```

`eval`, `ablate` and `diff --bundle` take the assumptions and the window: `--fill-lag 0|1`, `--slippage`, `--stable-apr`, `--capital`, `--start`, `--end`. The defaults are the honest assumptions every published number uses; overrides exist to measure what an assumption costs, never to pick a strategy. A report's `fingerprint` names the spec (`id@version#hash12`), the bundle's content hash, the evaluation settings and the code revision, and `report_hash` is the hash of its canonical JSON: the same inputs on the same revision give the same hash.

A report holds: the metrics the engine itself reports (ROI, drawdown, Sharpe over the stable APR, PnL split into price, yield and cost) plus exposure and turnover; per-rule `matches`, `wins`, `trades`, `shadowed` and `cooldown_skips`; the leave-one-out contribution of every rule, overlay and guard; the invariants with example days (`held_below_dma_days`, `buys_below_dma`, `proceeds_into_downtrend`, `cooldown_blocked_exits`, `stuck_in_stable`, and the hard `weights_valid`); a sparse decision trace; and warnings (synthetic data is not evidence, a window too short for walk-forward). The agent skill `.agents/skills/strategy-lab/SKILL.md` explains how to read it.

### Searching without fooling yourself

`liveness`, `sweep` and `holdout` guard a search of the parameter space. A search is only worth what its guards are worth, so each one refuses rather than flatters. Everything they write is under `.lab/` (git-ignored): runs in `.lab/runs/`, the ledger in `.lab/ledger.jsonl`, holdout pins in `.lab/holdouts/`.

```bash
pnpm --filter @zapengine/analytics-engine strategy-lab liveness --spec .lab/candidates/my_candidate.json --bundle prod:latest
pnpm --filter @zapengine/analytics-engine strategy-lab liveness --spec .lab/candidates/my_candidate.json --bundle prod:latest --only /rules[cross_down_exit]
pnpm --filter @zapengine/analytics-engine strategy-lab sweep --spec .lab/candidates/my_candidate.json --bundle prod:latest --space .lab/spaces/cooldowns.json
pnpm --filter @zapengine/analytics-engine strategy-lab sweep --spec .lab/candidates/my_candidate.json --reference reference/dma_fgi --bundle prod:latest --space .lab/spaces/cooldowns.json
pnpm --filter @zapengine/analytics-engine strategy-lab holdout init --lineage my-lineage --bundle prod:latest
pnpm --filter @zapengine/analytics-engine strategy-lab holdout status --lineage my-lineage
pnpm --filter @zapengine/analytics-engine strategy-lab holdout look --lineage my-lineage --spec .lab/candidates/my_candidate.json --bundle prod:latest
pnpm --filter @zapengine/analytics-engine strategy-lab ledger summary
pnpm --filter @zapengine/analytics-engine strategy-lab ledger show --kind sweep --limit 5
```

**`liveness`** perturbs every tunable leaf of a spec (the fields marked `x-tunable` in the schema, listed as _(tunable)_ in `VOCABULARY.md`) down and up, runs each variant over the same bars as the spec and compares the decision traces. Each leaf is `live` (a perturbation changes a decision on a `--bundle` history; `one_sided` when only one direction does), `dormant` (only a stress history shows a difference), `dead` (nothing changes anywhere) or `unprobed` (every perturbation breaks the spec's own rules). Stress histories default to six synthetic stress seeds; `--stress` (repeatable) names others and `--only` (repeatable) limits the probe to pointers starting with a prefix. Any dead leaf exits 1 and is listed in `warnings`; a history with no days in the window exits 4 instead of calling everything dead. Writes `.lab/runs/liveness-<hash>/liveness.json`.

**`sweep`** tries the assignments a search space names and reports how much to believe the best of them. The space file lists `parameters` (a tunable `pointer` with `values`, or `min`, `max` and `steps`) and `sampling` (`grid` over every combination up to 200 points, `random` or `halton` for `trials` points from `seed`). Only the development window is searched; the last 180 days are left for the holdout. Every trial is one continuous causal run, and the walk-forward folds are slices of it: each fold picks its best trial on its training days alone and is judged against the reference on the next 90 days (the spec itself unless `--reference` names another: promotion needs the production reference). The result carries the fold table (with each fold's drawdown against the reference), `fold_win_rate`, `mean_oos_edge_pp`, a seeded block-bootstrap interval of the out-of-sample edge, the plateau retention of the best trial, and its deflated Sharpe ratio, charged for every distinct candidate the ledger holds. Fewer than three folds (about 720 days of complete data) is `insufficient_evidence` and exit 4, never a result. Takes `--fill-lag`, `--slippage`, `--stable-apr` and `--capital`; the window is the bundle's. Writes `.lab/runs/sweep-<id>/sweep.json`.

**`holdout`** keeps one look at data nobody tuned on. `init` pins a lineage (a family of candidates tuned on the same data) at the last day of the bundle and never moves the pin. `status` says whether a look is allowed: it needs 90 days of data after the pin and an unused look. `look` spends the lineage's only look before it computes anything, then evaluates the candidate against `--reference` (default `reference/dma_fgi`) on the days after the pin. A second look, or an early one, exits 5 whatever the candidate. Whether the edge is enough is a promotion decision, not this command's. The look's numbers (the bundle it read, the assumptions, the edge over the reference) are kept in `.lab/holdouts/<lineage>.look.json`, where `promote` reads them.

**`ledger`** lists what the lab has tried. Every `eval`, `ablate`, `diff --bundle`, `liveness`, sweep trial and holdout step is appended to `.lab/ledger.jsonl`; `summary` counts entries per kind and the distinct specs (by behavior hash) that set the deflated Sharpe's bar, and `show` prints the latest entries. The file is local and append-only: deleting it forgets attempts, so a result that depends on it should state the count in its pull request.

### Promotion

`promote` decides whether a candidate may replace the reference, against `src/config/strategies/PROMOTION_POLICY.json`. The policy is the bar; its thresholds are the review's proposal, and changing them is a pull request of its own, never part of a promotion. It reads evidence the lab already wrote and runs the checks that need the candidate itself, and every gate says `pass`, `fail` or `insufficient`.

```bash
pnpm --filter @zapengine/analytics-engine strategy-lab promote --spec .lab/candidates/my_candidate.json --bundle prod:latest --sweep <sweep id> --lineage my-lineage
```

The evidence is a `sweep` of the candidate judged against the production reference (`sweep --reference reference/dma_fgi`, so the folds answer whether the candidate beats the reference out of sample) and the lineage's single holdout look (`holdout look`). The candidate must be the spec the sweep searched, or one of the trials the ledger recorded for it, and the spec the look was of: a candidate that changed after its look needs a new lineage. The checks it runs itself, on `--bundle`: whether any evidence is synthetic data (refused, it is not evidence), whether every number came from the default assumptions and capital, whether a tunable parameter is dead (`liveness`, with the stress histories), whether a hard invariant is broken, whether the candidate passes the behavioral validation events (`tests/fixtures/hierarchical_validation_events.json`; `--events` names another fixture) and whether the pinned golden traces still reproduce.

The bar the policy sets: at least three walk-forward folds, a fold win rate and a mean out-of-sample edge above the policy's levels with a bootstrap p-value below its limit, no fold whose drawdown is worse than the reference's by more than the allowance, a deflated Sharpe above its level (charged for every candidate in the ledger), and a holdout on which the candidate is not worse than the reference by more than the allowance. Evidence that is missing is `insufficient`, never a pass.

It writes `.lab/promotions/<id>.json` (candidate, reference, the policy's hash, the evidence and every gate with its number) and prints an `ITERATION_LOG.md` entry to paste in `result.log_entry`. Exit 0 is promotable, 1 is a failed gate, 4 is missing evidence. A promotable verdict is not a merge: bumping `reference/dma_fgi.json`, `spec lock`, the golden pin, the validation events and the performance snapshot go in the promotion's own pull request (`ITERATION_PLAYBOOK.md`).

### Pinned behavior (golden)

The snapshot gate needs production data and a read-only DSN. `golden` is its DSN-free counterpart: it runs a spec on six deterministic synthetic histories (`regimes` and `stress`, seeds 1 to 3, 400 days) and hashes the per-day decisions, targets, transfers and equity (only values the engine computes with plain float arithmetic, so the digests do not move between platforms). The pins live in `tests/fixtures/strategy_specs/golden_traces.json`, with each spec's behavior hash: the production reference; `all_research_rules.json`, a spec that uses every kind the reference does not (the twelve research rules, the SPY latch, a trade quota); and `v2_vocabulary.json`, a spec that uses every knob and kind added after the reference was locked (a per-asset exit cooldown, a deploy-stable cross-up, relative trims, a staged entry, the trend guard).

```bash
pnpm --filter @zapengine/analytics-engine strategy-lab golden --check   # exit 1 if a spec no longer reproduces its pin
pnpm --filter @zapengine/analytics-engine strategy-lab golden           # pin the default specs again
```

A refactor must leave the file untouched. A spec whose behavior changed fails the check before any digest is compared, and the way out is a version bump and a deliberate regeneration with the reason in the commit message, never an edited digest. `--spec` (repeatable) names specs to pin or check, and a spec given as a path is read relative to `apps/analytics-engine`. The same file is read by `tests/services/backtesting/test_engine_golden.py`, which runs the reference through the backtesting service the way the API does, so the file the lab checks and the path production runs cannot disagree.
