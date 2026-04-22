# Analytics Engine

FastAPI read-only analytics backend for the Zap Pilot ecosystem. Serves portfolio trends, risk metrics, and market sentiment.

## Setup

```bash
pnpm --filter @zapengine/analytics-engine build   # uv sync --locked (first-time setup)
pnpm --filter @zapengine/analytics-engine dev     # http://localhost:8001
```

From inside this directory, drop the `--filter …` prefix: `pnpm build`, `pnpm dev`, etc.

See [CLAUDE.md](./CLAUDE.md) for the full command list and gotchas.

## API

Grouped under `/api/v2`:

- `portfolio/{user_id}/landing` — unified landing-page payload
- `analytics/{user_id}/trend` · `risk` · `risk/summary` · `yield/summary` · `dashboard`
- `market/sentiment` · `sentiment/history` · `regime/history` · `sentiment/health`

Interactive docs at `/docs`.

## Import conventions

- Routers: `src.api.routers.*` (canonical). `src.api.routes.backtesting` is a deprecated shim.
- Strategies: `src.services.strategy.*` (canonical). `src.services.strategies.outlier_filter_strategy` is a deprecated shim.

## Dead-code policy

Two enforced checks on every push:

- `uv run python scripts/quality/check_service_reachability.py` — rejects unreachable `*ServiceDep` bindings
- `uv run vulture src/ vulture_whitelist.py --min-confidence 80` — symbol-level unused detection (weekly audit drops to 60)

Every entry in `vulture_whitelist.py` must carry an inline reason. Removing a module requires removing its whitelist entries in the same PR.

## Environment

PostgreSQL (Supabase) via async SQLAlchemy. `DATABASE_READ_ONLY=true` is enforced — writes are blocked at the pool level.
