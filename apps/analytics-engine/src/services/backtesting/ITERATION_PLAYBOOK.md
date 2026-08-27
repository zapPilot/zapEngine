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
   pnpm --filter @zapengine/analytics-engine test:strategy-snapshot
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
