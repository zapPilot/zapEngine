See @../../CLAUDE.md for app-level conventions.

# modules (alpha-etl pipelines)

Each subdirectory is one ETL pipeline. Pipelines follow a common shape:

```
<pipeline>/
├── fetcher.ts        # Pulls raw data from an external source (DeBank, Hyperliquid, …)
├── transformer.ts    # Pure mapping from raw → domain (no I/O)
├── writer.ts         # Persists domain rows to Postgres
├── processor.ts      # Orchestrates fetch → transform → write for one run
└── schema.ts         # Zod schemas / DB column shape (where applicable)
```

> The structural similarity across pipelines is on purpose. **Wave 2.5** will extract a shared `pipeline-runner.ts` in `src/lib/` to formalise this. New pipelines should keep the fetch / transform / write split so the refactor lands cleanly.

## Pipeline catalogue

| Pipeline           | Source / API                            | Cadence    | Rate limit          | Notes                                                                 |
| ------------------ | --------------------------------------- | ---------- | ------------------- | --------------------------------------------------------------------- |
| `core/`            | (infrastructure, not a pipeline)        | —          | —                   | Job queue, processor registry, DMA snapshots, MV refresh, health      |
| `hyperliquid/`     | Hyperliquid public API                  | minute     | 60 RPM (`HYPERLIQUID_RATE_LIMIT_RPM`) | Perp funding + APR                                                    |
| `token-price/`     | CoinGecko + DMA backfill                | hourly     | shared `RATE_LIMIT_*` | Token spot prices + ratio-DMA derived series                          |
| `stock-price/`     | Alpha Vantage (Yahoo fetcher fallback)  | daily      | 5/min, 25/day       | S&P500 reference series (free tier — careful with backfill)           |
| `macro-fear-greed/`| CoinMarketCap                           | daily      | (CMC plan)          | Fear & Greed Index                                                    |
| `sentiment/`       | (LLM / external sentiment provider)     | hourly     | —                   | Sentiment indicators                                                  |
| `wallet/`          | DeBank + chain RPCs                     | on-demand  | DeBank quotas       | User wallet balances & portfolio snapshots; webhook-triggered         |
| `vip-users/`       | Supabase                                | daily      | —                   | Activity filtering for VIP cohort                                     |

## Shared rules

- **Idempotency**: every writer must be idempotent — pipelines re-run on retry / replay
- **Rate limits**: respect the upstream limits in the table above. Use `core/`'s rate-limit helpers when sharing budget across pipelines.
- **MV refresh**: pipelines that feed materialised views should trigger `core/mvRefresh.ts` after a successful run when `ENABLE_MV_REFRESH=true`.
- **Telegram naming**: alpha-etl admin alerts use `TELEGRAM_*` — distinct from podcast-pipeline's `PIPELINE_TELEGRAM_*`. Keep them separate.
- **Schema drift**: any new column or table must add a Zod schema (`schema.ts`) and a SQL migration. The analytics-engine reads `alpha_raw.*` — coordinate breaking changes.

## Adding a new pipeline

1. Create `src/modules/<name>/` with the standard `fetcher / transformer / writer / processor / schema` files.
2. Register the processor in `core/processorRegistry.ts`.
3. Add the rate-limit config to `.env.example` (root) and document the upstream API.
4. Wire the cadence in the scheduler (or expose a webhook in `src/routes/`).
5. Add a `CLAUDE.md` in the new module if it has non-obvious conventions (auth, special pagination, etc.).
