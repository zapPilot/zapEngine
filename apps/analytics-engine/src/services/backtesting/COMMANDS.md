# Backtesting Operator Commands

> All scripts require the API running: `pnpm --filter @zapengine/analytics-engine dev`

## Snapshot (CI gate)

```bash
# Strict CI check — exits 1 on drift (default: excludes deprecated/research)
pnpm --filter @zapengine/analytics-engine test:strategy-snapshot

# Diagnostic — shows drift but never fails
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/sweep_production_window.py

# Update after intentional behavior change
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/sweep_production_window.py --update-snapshot

# Ad hoc strict check with explicit tolerances
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/sweep_production_window.py --check \
  --tolerance roi=2.0,calmar=0.10,sharpe=0.10,max_dd=1.0,trades=5
```

## Attribution (yearly windows; diagnostic only)

```bash
# Default: all windows + all registered variants
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/sweep_hierarchical.py \
  --windows 2024,2025,2026,combined

# Single window
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/sweep_hierarchical.py --windows 2025

# Custom baseline + variants + markdown output
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/sweep_hierarchical.py \
  --windows 2024,2025,2026,combined \
  --baseline-strategy dma_fgi_hierarchical_minimum \
  --variants dma_fgi_hierarchical_control,dma_fgi_hierarchical_minimum \
  --out attribution_$(date -I).md
```

Common `sweep_hierarchical.py` options:

| Option | Default | Description |
|---|---|---|
| `--endpoint` | `http://localhost:8001` | API base URL |
| `--windows` | `2024,2025,2026,combined` | Comma-separated windows |
| `--baseline-strategy` | — | Baseline for delta Calmar |
| `--variants` | all registered | Comma-separated strategy IDs |
| `--out` | — | Markdown output path |
| `--no-progress` | false | Disable progress bar |

## Validation (hierarchical regression events)

```bash
# Selected strategy over the full validation fixture window
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/analyze_compare.py \
  --saved-config-id dma_fgi_hierarchical_minimum \
  --config-id dma_fgi_hierarchical_minimum \
  --from-date 2025-01-01 \
  --to-date 2026-04-10 \
  --profile spy-eth-btc-rotation \
  --format markdown

# Single event constraint
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/analyze_compare.py \
  --saved-config-id dma_fgi_hierarchical_minimum \
  --config-id dma_fgi_hierarchical_minimum \
  --date 2025-04-22 \
  --history-start-date 2025-01-01 \
  --constraint-event-id btc_cross_up_2025_04_22 \
  --profile spy-eth-btc-rotation \
  --format json
```

`analyze_compare.py` loads `tests/fixtures/hierarchical_validation_events.json`
by default, checks constraints against the selected `config-id`, and exits
non-zero when any selected constraint fails. Use `--no-constraints` only for
diagnostics that should not gate strategy iteration.

## Diagnosis (SPY tax)

```bash
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/diagnose_spy_tax.py \
  --baseline-strategy dma_fgi_hierarchical_minimum \
  --reference-strategy dma_fgi_hierarchical_control \
  --reference-date 2026-04-15 \
  --window-days 500 \
  --out diagnostic_$(date -I).md
```
