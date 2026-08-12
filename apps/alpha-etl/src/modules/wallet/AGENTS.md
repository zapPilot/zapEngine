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
- Successful wallet writes are allowed to enqueue portfolio rollups; keep that side effect confined to the established wallet/rollup path.
