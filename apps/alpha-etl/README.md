# Alpha ETL

Webhook-triggered ETL service that collects DeFi data from three sources and writes to PostgreSQL.

**Pipelines:**
- **Pool APR** — DeFiLlama → `pool_apr_snapshots`
- **Wallet Balance** — DeBank → `wallet_token_snapshots` (VIP users)
- **Hyperliquid Vault** — Hyperliquid UI API → `portfolio_item_snapshots` + `hyperliquid_vault_apr_snapshots`

## Architecture

```
POST /webhooks/pipedream → ETL Pipeline Factory → [Fetcher → Transformer → Writer] → PostgreSQL
```

Each pipeline follows `BaseETLProcessor`: `fetcher.ts` → `transformer.ts` → `writer.ts`.

## Environment

All env vars live in the monorepo root `.env` (see `.env.example` at repo root). Required: `ALPHA_ETL_DATABASE_URL`. Optional: `WEBHOOK_SECRET` (enables webhook auth when set), `ALPHA_ETL_PORT=3003` (local port override).

## Migrations

Files in `migrations/` use non-sequential numbering with some duplicate prefixes — treat existing filenames as immutable history. New migrations use the next unused prefix after `012`.

## Deployment

Fly.io via Docker — `fly deploy`.
