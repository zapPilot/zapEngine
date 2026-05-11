# Alpha ETL

HTTP-triggered ETL service that collects wallet, vault, sentiment, token, and market data and writes to PostgreSQL.

**Pipelines:**
- **Wallet Balance** — DeBank → `wallet_token_snapshots` (VIP users)
- **Hyperliquid Vault** — Hyperliquid UI API → `portfolio_item_snapshots` + `hyperliquid_vault_apr_snapshots`
- **Fear & Greed** — CoinMarketCap → sentiment snapshots
- **Macro Fear & Greed** — CNN → macro sentiment snapshots
- **Token Price** — CoinGecko → token price snapshots + DMA
- **Stock Price** — Yahoo Finance → stock price snapshots + DMA

## Architecture

```
POST /webhooks/jobs → in-memory FIFO queue → ETL Pipeline Factory → [Fetcher → Transformer → Writer] → PostgreSQL
```

Each pipeline follows `BaseETLProcessor`: `fetcher.ts` → `transformer.ts` → `writer.ts`.

## Job API

`POST /webhooks/jobs` is the canonical queued endpoint for Pipedream and manual operations.

### Most common: trigger all sources (no sources specified)

```json
{}
```

Runs all 6 sources sequentially: `debank`, `hyperliquid`, `feargreed`, `macro-fear-greed`, `token-price`, `stock-price`

```bash
curl -X POST /webhooks/jobs -H "Content-Type: application/json" -d '{}'
```

### Specific sources only

```json
{ "sources": ["hyperliquid", "debank"] }
```

Runs only the requested current sources sequentially.

```bash
curl -X POST /webhooks/jobs -H "Content-Type: application/json" \
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

All env vars live in the monorepo root `.env` (see `.env.example` at repo root). Required: `ALPHA_ETL_DATABASE_URL`. Optional: `WEBHOOK_SECRET` (enables webhook auth when set), `ALPHA_ETL_PORT=3003` (local port override).

## Migrations

Files in `migrations/` use non-sequential numbering with some duplicate prefixes — treat existing filenames as immutable history. New migrations use the next unused prefix after `012`.

## Deep dives

See [docs/adr/](./docs/adr/) for architectural decision records.

## Deployment

Fly.io via Docker — `fly deploy`.
