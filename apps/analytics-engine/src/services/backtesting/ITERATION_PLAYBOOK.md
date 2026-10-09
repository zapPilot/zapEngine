# Backtesting Iteration Playbook

Use this checklist for any rule, priority, or saved-config behavior change in
`dma_fgi_portfolio_rules`.

## Gate

1. Edit rules, priorities, sizing, or risk guards.
2. Update the behavioral validation fixture when expected decisions change,
   then run its gate and the backtesting suite:
   ```bash
   pnpm --filter @zapengine/analytics-engine exec uv run pytest \
     tests/test_validation_events.py tests/services/backtesting
   ```
3. Check the pinned production-history snapshot:
   ```bash
   pnpm --filter @zapengine/analytics-engine test:strategy-snapshot:fast
   ```
4. Regenerate the 500-day snapshot only for intentional performance drift:
   ```bash
   pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/sweep_production_window.py \
     --update-snapshot
   ```
   The fixture's `reference_date` rolls forward daily via
   `.github/workflows/backtest-refresh.yml`; a manual run without
   `--reference-date` re-cuts at the fixture's current date, so iteration
   diffs stay apples-to-apples. Pass `--reference-date` explicitly only when
   you intend to move the window.
5. Prepend an `ITERATION_LOG.md` entry using the template below.

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
