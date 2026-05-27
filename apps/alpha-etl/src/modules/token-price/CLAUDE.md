See @../CLAUDE.md for the shared pipeline shape.

# token-price (pipeline)

Pulls token spot prices from CoinGecko and derives daily moving averages (DMA) and ratio-DMA series for the analytics-engine strategy layer.

## Files

- `fetcher.ts` — CoinGecko market data (current + range)
- `processor.ts` + `processor.helpers.ts` — orchestrates fetch → transform → write per token list
- `schema.ts` — Zod schemas for CoinGecko responses + DB rows
- `writer.ts` — writes raw spot prices
- `dmaCalculator.ts` — pure DMA math (7-day, 30-day, 100-day windows)
- `dmaService.ts` + `dmaWriter.ts` — orchestrates DMA computation + DB write
- `ratioDmaWriter.ts` — writes derived ratio series (e.g. BTC/ETH DMA)
- `backfill.helpers.ts` — guards & windowing for backfill runs (used by ops scripts)
- `index.ts` — barrel

## Source notes

- Endpoint: `COINGECKO_API_URL` (default `https://api.coingecko.com/api/v3`)
- Rate limit: free tier ~10-50 req/min depending on IP — use the shared limiter from `core/`
- DEBANK is for wallet snapshots, not pricing — don't confuse pipelines

## Gotchas

- CoinGecko ids ≠ symbol. The mapping must come from the registered token list, not user input.
- DMA windows are inclusive of the current day's price — if the price for "today" isn't in yet, the latest DMA point is stale. `backfill.helpers.ts` skips today during cold backfill.
- Ratio-DMA depends on both legs being present for the same day. Missing data points must produce NULL, not zero.
- Materialized views downstream depend on `dmaWriter.ts` + `ratioDmaWriter.ts` outputs — trigger MV refresh after both complete.
