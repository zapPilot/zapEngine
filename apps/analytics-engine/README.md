# Analytics Engine

FastAPI read-only analytics backend for the Zap Pilot ecosystem. Serves portfolio trends, risk metrics, and market sentiment.

## Setup

```bash
pnpm --filter @zapengine/analytics-engine build   # uv sync --locked (first-time setup)
pnpm --filter @zapengine/analytics-engine dev     # http://localhost:8001
```

From inside this directory, drop the `--filter …` prefix: `pnpm build`, `pnpm dev`, etc. From the monorepo root, the default `pnpm dev` already includes analytics-engine; use `pnpm dev analytics` only when you want this service by itself.

See [AGENTS.md](./AGENTS.md) for the full command list and gotchas.

## API

Grouped under `/api/v2`:

- `portfolio/{user_id}/landing` — unified landing-page payload
- `analytics/{user_id}/trend` · `yield/daily` · `dashboard`
- `market/sentiment` · `regime/history` · `sentiment/health`

Interactive docs at `/docs`.

## Backtesting & Strategy Iteration

See the scoped [backtesting instructions](./src/services/backtesting/AGENTS.md),
which point to the canonical iteration log, playbook, and operator commands.

## Import conventions & dead-code policy

See [AGENTS.md](./AGENTS.md).

## Environment

PostgreSQL (Supabase) via async SQLAlchemy. `DATABASE_READ_ONLY=true` is enforced — writes are blocked at the pool level. Local port override: `ANALYTICS_ENGINE_PORT=8001`.

## Deep dives

See [docs/](./docs/):

- [Snapshot architecture](../../docs/snapshot_architecture.md)
- [diagnostics/](./docs/diagnostics/)
