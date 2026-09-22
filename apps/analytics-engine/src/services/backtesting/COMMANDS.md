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

## Laya direct-allocation research

This is research-only and does not register a production strategy. Run from the
repository root so the canonical prod environment injects the read-only history
DSN:

```bash
node scripts/env/run.mjs --environment prod -- \
  uv --directory apps/analytics-engine run --group research \
  python scripts/research/laya/runner.py
```

Useful controls:

```bash
# Exercise the entire 500-day data + backtest path without loading model weights.
node scripts/env/run.mjs --environment prod -- \
  uv --directory apps/analytics-engine run --group research \
  python scripts/research/laya/runner.py --fake-client

# Lower model-call frequency without changing the daily backtest clock.
node scripts/env/run.mjs --environment prod -- \
  uv --directory apps/analytics-engine run --group research \
  python scripts/research/laya/runner.py --decision-cadence-days 7

# Compare a subset of the experiment encodings.
node scripts/env/run.mjs --environment prod -- \
  uv --directory apps/analytics-engine run --group research \
  python scripts/research/laya/runner.py \
  --encodings per_bucket_score posture_mixture
```

The default cache is `reports/laya/cache/laya_direct_allocation.jsonl`; rerunning
with the same model/device/encoding version resumes completed decisions. Use
`--no-cache` only when intentionally re-evaluating every state. Design and the
latest pinned-window result are documented in
`../../../scripts/research/laya/README.md`.
