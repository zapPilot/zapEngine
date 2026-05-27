See @../CLAUDE.md for the shared pipeline shape.

# wallet (pipeline)

On-demand pipeline triggered by account-engine webhooks. Pulls a user's wallet balance and portfolio breakdown via DeBank, normalises, and writes per-wallet snapshots.

## Files

- `fetcher.ts` — DeBank protocol + token balance fetches
- `balanceTransformer.ts` — raw balance rows → domain balance rows
- `portfolioTransformer.ts` — protocol positions → portfolio rows (chain × protocol × position)
- `balanceWriter.ts` — DB upsert for balances; idempotent on `(wallet, chain, token)`
- `portfolioWriter.ts` — DB upsert for portfolio rows
- `fetchProcessor.ts` — orchestrates a single wallet refresh request
- `processor.ts` — batches multiple wallets per webhook payload
- `helpers.ts` — chunking, error mapping, retry decisions

## Trigger

- Webhook: `POST /webhooks/wallet-fetch` (auth: `WEBHOOK_SECRET` must equal account-engine's `ALPHA_ETL_WEBHOOK_SECRET`)
- Synchronous response is just "accepted"; actual work runs via the job queue (`core/jobQueue.ts`)

## Source notes

- Endpoint: `DEBANK_API_URL` (default `https://pro-openapi.debank.com`)
- Auth: `DEBANK_API_KEY` recommended for production-scale (free tier is rate-limited heavily)
- `DEBANK_STRICT_ERRORS=true` makes the fetcher throw on any non-2xx; flip to `false` in degraded mode to log + skip

## Gotchas

- DeBank chain ids are *strings* (`'eth'`, `'arb'`) — the converters in `helpers.ts` map to numeric `ChainId`. Don't pass raw DeBank ids to downstream code.
- DeBank protocol positions can double-count when a wallet supplies the same vault on multiple chains — dedupe by `(protocolId, vaultId, chainId)`.
- A single wallet can hold tokens on chains not in the registered chain list. `balanceTransformer.ts` filters to known chains; surprising data probably means the chain list needs updating.
- This is the only pipeline triggered synchronously by user action — keep the path fast (< 30s end-to-end) or front-load with the job queue.
