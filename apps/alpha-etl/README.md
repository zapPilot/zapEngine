# Alpha ETL

HTTP-triggered ETL service that collects wallet, vault, sentiment, token, and market data and writes to PostgreSQL.

**Pipelines:**

- **Wallet Balance** — DeBank → `analytics.daily_wallet_tokens` + `analytics.daily_portfolio_positions`
- **Hyperliquid Vault** — Hyperliquid UI API → `analytics.daily_portfolio_positions` + `hyperliquid_vault_apr_snapshots`
- **Fear & Greed** — CoinMarketCap → sentiment snapshots
- **Macro Fear & Greed** — CNN → macro sentiment snapshots
- **Token Price** — CoinGecko → token price snapshots + DMA
- **Stock Price** — Yahoo Finance → stock price snapshots + DMA

## Architecture

```
POST /webhooks/jobs → in-memory FIFO queue → ETL Pipeline Factory → [Fetcher → Transformer → Writer] → PostgreSQL
```

Each pipeline follows `BaseETLProcessor`: `fetcher.ts` → `transformer.ts` → `writer.ts`.

Wallet and portfolio writers replace each affected provider/wallet/UTC-day
slice in one transaction, including successful empty fetches. After DeBank or Hyperliquid writes, the queue invokes
`analytics.rebuild_category_trends(text[])`; on-demand wallet jobs scope the
rebuild to `metadata.userId`, while batch jobs rebuild all users. Snapshot
triggers, dirty queues, and database cron are not part of this path.

## Job API

`POST /webhooks/jobs` is the canonical queued endpoint for scheduled and manual
operations. It requires `Authorization: Bearer $WEBHOOK_SECRET`; the server
rejects the request when the credential is missing, invalid, or not configured.
`POST /webhooks/pipedream` remains a compatibility alias with the same boundary.

### Most common: trigger all sources (no sources specified)

```json
{}
```

Runs all 6 sources sequentially: `debank`, `hyperliquid`, `feargreed`, `macro-fear-greed`, `token-price`, `stock-price`

```bash
curl -X POST /webhooks/jobs \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Specific sources only

```json
{ "sources": ["hyperliquid", "debank"] }
```

Runs only the requested current sources sequentially.

```bash
curl -X POST /webhooks/jobs -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -d '{"sources": ["debank", "hyperliquid"]}'
```

### Backfill tasks

```json
{
  "tasks": [
    {
      "source": "token-price",
      "operation": "backfill",
      "tokens": [{ "tokenId": "bitcoin", "tokenSymbol": "BTC", "daysBack": 3 }]
    }
  ]
}
```

Runs explicit backfill work through the same queue. `trigger` is not required; scheduling belongs to the HTTP caller.

## Environment

All env vars live in the monorepo root `.env` (see `.env.example` at repo root).
Required: `ALPHA_ETL_DATABASE_URL`. Production job triggers also require
`WEBHOOK_SECRET`; job enqueue endpoints fail closed when it is absent.
`ALPHA_ETL_PORT=3003` is an optional local port override.

## Daily schedule and recovery

GitHub Actions owns the 10:00 UTC daily refresh through
`.github/workflows/alpha-etl-daily-refresh.yml`. The repository secret
`ALPHA_ETL_WEBHOOK_SECRET` must match Fly's `WEBHOOK_SECRET` before the auth
enforcement is deployed. The workflow sends an empty body to the canonical job
endpoint, preserving the six-source refresh.

If a run fails, first confirm both secret locations still match and inspect the
Alpha ETL Fly logs. Then use **Run workflow** to dispatch the same workflow
manually. A successful HTTP 202 proves enqueue only; confirm the queued job in
the service logs before considering recovery complete.

## Migrations

Files in `migrations/` use non-sequential numbering with some duplicate prefixes and are immutable history. Create new database migrations through the root [`supabase/migrations/`](../../supabase/migrations/) workflow documented in [`CONTRIBUTING.md`](../../CONTRIBUTING.md#adding-a-database-migration).

## Deep dives

See [docs/adr/](./docs/adr/) for architectural decision records.

## Deployment

Fly.io via Docker — `fly deploy`.
