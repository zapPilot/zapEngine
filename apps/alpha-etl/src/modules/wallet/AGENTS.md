See @../AGENTS.md for the shared ETL module rules.

# Wallet pipeline

On-demand DeBank/chain-RPC pipeline triggered by account-engine through `POST /webhooks/wallet-fetch` and executed through the ETL job queue.

## Boundaries

- `WEBHOOK_SECRET` on alpha-etl must match account-engine's `ALPHA_ETL_WEBHOOK_SECRET` for this route.
- Keep DeBank provider I/O in `fetcher.ts`; normalization belongs in the balance/portfolio transformers and persistence in the writers.
- DeBank chain ids are provider strings such as `eth` and `arb`; convert them through the existing chain helpers before passing data downstream.
- Unknown/unregistered chains are filtered by the current normalization path. Update the registered chain mapping deliberately rather than leaking raw provider ids into shared contracts.
- Preserve the job-queue acceptance model: the webhook acknowledges work and the queue performs the refresh; do not turn the route into a long-running synchronous fetch.
- `DEBANK_STRICT_ERRORS` controls provider error behavior. Do not silently change strict/degraded semantics in unrelated work.
- Successful wallet writes rebuild category trends through the established
  post-write synchronizer; do not add database queues or cron fallback.
- Pass every successfully fetched wallet to both daily writers even when its transformed position or token list is empty. Portfolio replacement keys include the provider so DeBank refreshes cannot delete Hyperliquid rows for the same wallet/day.
- Per-wallet emptiness stays a success (see above), but a VIP batch where every fetched wallet returned no tokens and no positions fails the source: DeBank answering 200 with nothing is not a day on which every VIP wallet emptied out. Keep the assertion at batch level so the writers still clear each wallet/day slice.
