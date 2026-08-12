See @../AGENTS.md for the shared ETL module rules.

# Token-price pipeline

CoinGecko spot prices feed token DMA and ETH/BTC pair-ratio DMA series consumed by analytics-engine.

## Invariants

- CoinGecko ids are not symbols. Resolve ids from the registered token configuration; do not derive provider ids from user-entered symbols.
- Use the shared provider limiter and existing `CoinGeckoFetcher`; do not add direct CoinGecko calls in processors or DMA services.
- Backfill queries the database first and fetches only missing dates; preserve that behavior rather than refetching full history.
- DMA calculations remain pure and deterministic; database and provider I/O belong in services/writers/fetchers.
- Pair-ratio DMA requires overlapping observations for both legs. Never invent zero-valued observations to fill missing market data.
- This pipeline does not enqueue or execute portfolio rollups.
