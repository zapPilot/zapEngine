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
- 1: a gate failed (a generated artifact or a lock is out of date, or a lock would hide a behavior change).
- 2: the command does not apply to what it was given, or a usage error.
- 3: the spec is missing or invalid.
- 4 and 5: data or coverage is insufficient, and a holdout request was refused. Reserved for the bundle and holdout commands.

```bash
pnpm --filter @zapengine/analytics-engine strategy-lab spec validate reference/dma_fgi
pnpm --filter @zapengine/analytics-engine strategy-lab spec hash reference/dma_fgi --canonical
pnpm --filter @zapengine/analytics-engine strategy-lab spec lock reference/dma_fgi
pnpm --filter @zapengine/analytics-engine strategy-lab schema          # regenerate the schema and VOCABULARY.md
pnpm --filter @zapengine/analytics-engine strategy-lab schema --check  # fail if they are stale
```
