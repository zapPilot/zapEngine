# Backtesting Iteration Playbook

Use this checklist for any rule, priority, or saved-config behavior change in
`dma_fgi_portfolio_rules`.

## Gate

1. Edit rules, priorities, sizing, or risk guards.
2. Run `analyze_compare.py` for every changed saved config:
   ```bash
   pnpm --filter @zapengine/analytics-engine exec uv run python scripts/analyze_compare.py \
     --saved-config-id <strategy_id> --from-date 2025-01-01 --to-date 2026-04-10 --summary
   ```
3. Run a decision-log attribution report:
   ```bash
   pnpm --filter @zapengine/analytics-engine exec uv run python scripts/analyze_compare.py \
     --saved-config-id dma_fgi_portfolio_rules --from-date 2025-01-01 --to-date 2026-04-10 \
     --emit-decision-log --decision-log-dir /tmp/zapengine-decisions
   pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/per_rule_report.py \
     /tmp/zapengine-decisions/decisions.jsonl --strategy dma_fgi_portfolio_rules --format markdown
   ```
4. If a rule priority, allowlist, or trigger changed, run standalone isolation:
   ```bash
   pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/rule_only_sweep.py \
     --reference-date 2026-04-15 --days 500 --format markdown
   ```
5. Regenerate the 500-day snapshot only for intentional performance drift:
   ```bash
   pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/sweep_production_window.py \
     --update-snapshot
   ```
6. Prepend an `ITERATION_LOG.md` entry using the template below.

## Log Template

```markdown
### YYYY-MM-DD - Short iteration title
- **Status**: active | superseded | removed-strategy
- **Commit**: pending local change (`short scope`) or `<hash>`
- **Finding**: One paragraph explaining what changed and why.
- **Snapshot delta**: ROI, Calmar, Sharpe, MaxDD, trade count versus prior baseline.
- **Per-rule report**: Attach match / win / shadowed counts and top shadowing pairs.
- **Rule-only sweep**: Attach standalone deltas for any rule whose trigger or priority changed.
- **Validation**: List targeted validation events and test commands.
- **Next**: Follow-up items or explicit no-follow-up note.
```

## Interpretation

Leave-one-out on the flat first-match engine measures marginal contribution
given the current priority order. It is not a standalone rule-quality score.
Use `per_rule_report.py` to identify shadowing, and `rule_only_sweep.py` to
measure `minimal baseline + rule` behavior independently of production priority.
