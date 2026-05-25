See @../CLAUDE.md for the shared pipeline shape.

# hyperliquid (pipeline)

Pulls perpetual funding rates from Hyperliquid's public API, converts to annualised APR, and writes to `alpha_raw.hyperliquid_funding` (or equivalent — check `aprWriter.ts`).

## Files

- `fetcher.ts` + `fetcher.helpers.ts` — Hyperliquid `/info` POST endpoints, paginated where needed
- `transformer.ts` — funding rate (8h) → annualised APR; handles negative funding
- `aprWriter.ts` — DB upsert; idempotent on `(asset, timestamp)`
- `processor.ts` + `processor.helpers.ts` — orchestration, rate limiting, retry

## Source notes

- Endpoint: `HYPERLIQUID_API_URL` (default `https://api-ui.hyperliquid.xyz`)
- Rate limit: `HYPERLIQUID_RATE_LIMIT_RPM` (default 60). Hyperliquid is generous but bursty calls get throttled.
- Auth: none required for public funding data.
- Timezone: Hyperliquid timestamps are UTC ms. Don't apply local-time conversion before writing.

## Gotchas

- Funding compounds every 8h on Hyperliquid; the APR conversion multiplies by `365 / (8/24) = 1095` — don't accidentally use 365 directly.
- Negative funding is meaningful (shorts pay longs). Don't clamp to zero.
- Backfilling: Hyperliquid's `/funding` history endpoint is paginated by epoch range, not cursor. Walk by 1-day windows.
