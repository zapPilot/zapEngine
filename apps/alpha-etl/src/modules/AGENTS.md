See @../../AGENTS.md for app-level conventions.

# ETL modules

Each subdirectory is one pipeline. Keep the established fetch/transform/write/orchestrate separation where it exists; do not force a shared abstraction across pipelines unless the current code and tests show repeated behavior that actually benefits from one.

## Shared invariants

- Writers must be idempotent because jobs can retry or replay.
- Respect provider rate limits through the existing shared limiter/base fetcher; do not bypass it with direct ad-hoc requests.
- DeBank wallet writes and successful `wallet_fetch` jobs are the paths that enqueue portfolio rollup work. Other pipelines must not invoke portfolio rollups as a side effect.
- Alpha ETL admin Telegram settings stay under `TELEGRAM_*`; podcast-pipeline uses the separate `PIPELINE_TELEGRAM_*` namespace.
- Database shape changes require the matching schema/type changes and SQL migration. `analytics-engine` reads `alpha_raw.*`, so breaking changes must be coordinated across that boundary.
- Add a nested `AGENTS.md` only for module-specific traps that are not obvious from code/tests; do not copy these shared rules into every pipeline.

## Current source ownership

- `hyperliquid/`: Hyperliquid vault positions and vault APR snapshots.
- `token-price/`: CoinGecko spot prices plus token and pair-ratio DMA series.
- `stock-price/`: equity reference series and DMA.
- `macro-fear-greed/`: CNN macro Fear & Greed; the app-level `AGENTS.md` owns its source/naming constraints.
- `wallet/`: DeBank and chain-RPC wallet snapshots triggered on demand.
