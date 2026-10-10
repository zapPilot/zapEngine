# Backtesting Iteration Playbook

Use this for any change to `dma_fgi_portfolio_rules`. Pick the track first.

## Track A: only a spec changes

A number, the presence or order of a rule, an overlay, a knob the vocabulary
(`VOCABULARY.md`) already has. The reference is never edited in place: the work
happens in the lab, and the reference changes only through a promotion.

1. `strategy-lab spec new --from reference/dma_fgi`, and edit the candidate in
   `.lab/candidates/`. `spec validate`, then `diff`, `eval` and `ablate` on a
   real bundle say what it does and why (`COMMANDS.md`).
2. `liveness`: a parameter that changes no decision is removed or fixed, not
   swept.
3. Start a holdout lineage (`holdout init`) before tuning anything, so the data
   the look will use does not exist yet.
4. `sweep --reference reference/dma_fgi` over a small space of the candidate's
   own knobs. It needs about 720 days of complete data; fewer is
   `insufficient_evidence`, and synthetic data is never evidence.
5. After 90 new days, `holdout look` once. Do not change the candidate and ask
   again: a changed candidate is a new lineage.
6. `promote`. Only a `promotable` verdict (exit 0) opens the Gate below; the
   policy is `src/config/strategies/PROMOTION_POLICY.json`, and the log entry
   it prints is the iteration log entry of the promotion.

**The structural path.** A candidate that only simplifies the reference skips
steps 3 to 5: it removes rules (the rest keep their order), overlays, optional
parameters or list entries, or changes a categorical choice (an exit's
`cooldown_scope`, where proceeds go), and moves no number. Run steps 1 and 2,
then `promote --track structural --bundle prod:latest` (no sweep, no lineage).
It must not trail the reference on the real bundle by more than the policy's
`structural.real_bundle` margins, nor in the median over its fixed synthetic
suite, and it meets the same prerequisites. A candidate that moves any number,
even alongside a simplification, takes the search path.

## Track B: the engine or the vocabulary changes

A new rule kind or knob, a rule class, a signal, the executor. The behavior of
every spec that did not ask for the change must not move.

- `pnpm strategy-lab golden --check` must pass untouched: the reference and the
  pinned fixture specs reproduce their digests. A refactor never regenerates
  them; an intentional change does, with the reason in the commit message.
- A knob added to an existing kind has a default that reproduces the old
  behavior, and a spec at that default keeps its hash; a knob with no such
  default is a new kind. Regenerate the schema and `VOCABULARY.md`
  (`strategy-lab schema`) in the same change, and give each new number an
  `x-tunable` marker so `liveness` can probe it.
- Add the knob or kind to `tests/fixtures/strategy_specs/v2_vocabulary.json`
  (or a fixture of its own) so the golden file pins it.
- The strategy it enables is Track A afterwards: nothing is promoted by being
  possible to write.

## The review's queue

The review of the reference proposed seven changes. They are hypotheses, not
decisions: each is a candidate for Track A, one pull request each, and only a
`promotable` record opens it. Reference version 2 made three of them (2, 4 and
7), promoted together on the structural path; the other four are open. Make a
copy with `spec new --from reference/dma_fgi` and apply the edit below to the
copy; run them in this order, each on its own holdout lineage.
`tests/services/backtesting/spec/test_review_queue.py` keeps every open edit below
a valid, runnable spec as the vocabulary changes.

1. **Trend guard.** Add to `overlays`: `{"kind": "trend_guard", "id": "trend_guard",
   "mode": "force_exit", "below_dma_buffer": 0.02, "confirm_days": 3}`. The
   invariant: an asset below its DMA is held at zero, whatever route brought it
   there. Compare `held_below_dma_days` and `buys_below_dma` with the reference's
   on the same bundle, and the days spent in stable.
2. **Drop `fgi_downshift_dca_sell`.** Done in version 2.
3. **One ratio rule, or no stable sweep.** Either remove `eth_btc_deviation_dca`
   (the trend rotation and the mean-reversion rotation bet opposite ways on one
   signal) or change `/rules[eth_btc_ratio_rotation]/cross_up/sources` from
   `["BTC", "STABLE"]` to `["BTC"]`.
4. **Trim proceeds into stable only.** Done in version 2.
5. **Relative trims, with a re-buy.** `sizing` `{"mode": "relative",
   "floor_weight": 0.1}` on the overextension trim, and a `trend_dca_entry` rule
   below it so what a trim sold comes back in steps while the trend holds.
6. **Staged entry.** Replace `dma_cross_up_rebalance` with `trend_dca_entry`
   (`buy_step` 0.1, `max_weight` 0.34), or keep it with `allocation`
   `deploy_stable` so a cross-up does not undo the trims.
7. **Per-asset exit cooldown.** Done in version 2.

Each needs the recorded production bundle (an operator step: `bundle record`),
about 720 days of complete data for the sweep and 90 more for the look.
Nothing here can be decided on synthetic data.

The review that led to version 2 found more, most of which the vocabulary cannot
say yet (Track B first):

- **A swallowed exit is not retried.** A cross-down inside the DMA signal's
  cross cooldown (30 days after the asset's last cross, 14 for SPY) is dropped,
  not delayed: ETH stayed held for 41 days below its average from 2025-06-14
  (`signals/dma_gated_fgi/signal_engine.py`). An exit that waits for the
  cooldown to end is engine work.
- **A rule can win without trading.** A matched rule takes the day by priority
  even when it moves nothing, so the cross-down of an asset not held beats a
  same-day cross-up of another (`portfolio_rules/_matcher.py`). On the 944-day
  production bundle version 2's overextension trim wins 284 days and trades on
  63. Matching only when the target differs from the holdings is engine work.
- **The ratio sweep ignores ETH's trend.** A ratio cross-up moves BTC and all
  stable into ETH even when ETH is below its own average (2026-07-27, ETH 8%
  and BTC 10% below theirs). Items 1 and 3 above say it today.
- **Nothing buys back after trims.** From 2025-11-13 version 1 sat in stable
  for 127 days while SPY stayed 10–12% above its average: trims kept firing and
  only a cross-up could re-enter. Version 2, which trims into stable only, does
  more of it: on the 944-day production bundle it spends 241 days in long
  all-stable runs while an asset is above its average (`stuck_in_stable`),
  against version 1's 177. Items 5 and 6 above say it today.
- **The exit's own cooldown barely acts.** Under version 2, on the 944-day
  production bundle, shortening `cross_down_exit`'s 30-day cooldown to 15 days
  changes one day and lengthening it changes none. Removing it needs a kind
  that allows a rule without a cooldown. (The review's 499-day recording
  showed the same for the cross-up's cooldown, but on the longer bundle
  lengthening that one to 60 days changes 215 days, so it stays.)

## Gate

Changing the reference (the end of Track A, or any deliberate behavior change):

1. Edit the reference spec, `src/config/strategies/reference/dma_fgi.json`:
   rules, their order (precedence), sizing and overlays. The spec is the only
   place the strategy's behavior lives. A rule kind or knob the spec cannot yet
   say is Python in `spec/rules.py` and the rule class, with the generated schema
   and `VOCABULARY.md` regenerated in the same change. A behavior change needs a
   new `version`; record it with
   `pnpm --filter @zapengine/analytics-engine strategy-lab spec lock reference/dma_fgi`
   (the service refuses to start on a reference that drifted from its lock).
2. Pin the new behavior DSN-free, with the reason in the commit message:
   ```bash
   pnpm --filter @zapengine/analytics-engine strategy-lab golden
   ```
3. Update the behavioral validation fixture when expected decisions change,
   then run its gate and the backtesting suite:
   ```bash
   pnpm --filter @zapengine/analytics-engine exec uv run pytest \
     tests/test_validation_events.py tests/services/backtesting
   ```
4. Check the pinned production-history snapshot:
   ```bash
   pnpm --filter @zapengine/analytics-engine test:strategy-snapshot:fast
   ```
5. Regenerate the 500-day snapshot only for intentional performance drift:
   ```bash
   pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/sweep_production_window.py \
     --update-snapshot
   ```
   The fixture's `reference_date` rolls forward daily via
   `.github/workflows/backtest-refresh.yml`; a manual run without
   `--reference-date` re-cuts at the fixture's current date, so iteration
   diffs stay apples-to-apples. Pass `--reference-date` explicitly only when
   you intend to move the window.
6. Prepend an `ITERATION_LOG.md` entry using the template below.

## Re-baselining after an assumption change

An engine or assumption change (fill timing, yield, slippage, the metric
definitions) moves every headline number on purpose, so the daily refresh's ROI
guard would refuse it and the committed artifacts would be stale. Re-baseline on
the PR branch, once, right before merging:

1. Rebase the branch on `main`, so the refresh starts from the artifacts the
   daily bot last wrote and does not race its 01:30 UTC commit.
2. Run **Backtest Refresh** (`backtest-refresh.yml`) on the PR branch with
   `max_roi_shift` set above the expected move (the PR description states it).
   The job regenerates the snapshot fixture and the landing JSON, runs the
   landing test suite against them, and pushes one commit to the branch.
3. That push comes from `GITHUB_TOKEN`, which does not trigger CI: close and
   reopen the PR (or push another commit) so the full CI runs on it.
4. Read the new headline numbers against the log entry's decomposition before
   approving. Re-run `scripts/pinned_strategy/export_landing_examples.py` for
   the verifiable-strategy example, which replays the same engine.
5. Check the landing copy: every claim about the backtest's assumptions must
   still be true (`backtest-stats.ts`, `messages.ts`, `pitch.ts`, the
   track-record docs).

Never edit the fixture or the landing JSON by hand, and never widen the drift
tolerances to make a re-baseline pass.

## Log Template

```markdown
### YYYY-MM-DD - Short iteration title

- **Status**: active | superseded | removed-strategy
- **Commit**: pending local change (`short scope`) or `<hash>`
- **Finding**: One paragraph explaining what changed and why.
- **Snapshot delta**: ROI, Calmar, Sharpe, MaxDD, trade count versus prior baseline.
- **Validation**: List targeted validation events and test commands.
- **Next**: Follow-up items or explicit no-follow-up note.
```
