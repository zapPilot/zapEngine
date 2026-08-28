See @../../AGENTS.md for app-level conventions.

# ETL modules

Each subdirectory is one pipeline. Keep the established fetch/transform/write/orchestrate separation where it exists; do not force a shared abstraction across pipelines unless the current code and tests show repeated behavior that actually benefits from one.

## Shared invariants

- Writers must be idempotent because jobs can retry or replay.
- Canonical daily writers replace only the successful provider's wallet/day slice. A successful empty provider response must still delete that slice so removed positions or tokens do not remain stale; failed provider responses must not delete it.
- Respect provider rate limits through the existing shared limiter/base fetcher; do not bypass it with direct ad-hoc requests.
- DeBank and Hyperliquid position writes rebuild category trends. Successful
  `wallet_fetch` jobs rebuild only `metadata.userId`; batch jobs pass `NULL` to
  rebuild all users. Other pipelines must not rebuild category trends.
- Alpha ETL admin Telegram settings stay under `TELEGRAM_*`; podcast-pipeline uses the separate `PIPELINE_TELEGRAM_*` namespace.
- Database shape changes require the matching schema/type changes and SQL migration. `analytics-engine` reads `alpha_raw.*`, so breaking changes must be coordinated across that boundary.
- Add a nested `AGENTS.md` only for module-specific traps that are not obvious from code/tests; do not copy these shared rules into every pipeline.

## Current source ownership

- `hyperliquid/`: Hyperliquid vault positions and vault APR snapshots.
- `token-price/`: CoinGecko spot prices plus token and pair-ratio DMA series.
- `stock-price/`: equity reference series and DMA.
- `macro-fear-greed/`: CNN macro Fear & Greed; the app-level `AGENTS.md` owns its source/naming constraints.
- `wallet/`: DeBank and chain-RPC wallet snapshots triggered on demand.
- `user-service/`: reads the per-wallet, per-provider service policy that decides which wallets the DeBank and Hyperliquid batches refresh, records what those refreshes cost per user, and writes each provider's refresh outcome back once that provider's load has committed.
