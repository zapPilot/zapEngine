# Snapshot architecture

DeBank and Hyperliquid snapshot history is stored directly at its supported
daily grain. The ETL runs a replace batch for every affected `(wallet, UTC
date)` inside one transaction: delete the existing slice, then insert every row
from the latest observed batch.

## Canonical tables

- `analytics.daily_portfolio_positions` keeps every DeBank or Hyperliquid
  position in the observed daily batch. `id_raw` is protocol-level and must
  never be used to deduplicate positions.
- `analytics.daily_wallet_tokens` keeps idle wallet tokens only
  (`is_wallet = true`) with the reader-facing balance columns.
- `analytics.daily_category_trends` is derived from both daily tables.
  `analytics.rebuild_category_trends(text[])` recomputes each selected user's
  complete history because `pnl_usd` depends on the preceding day. Passing
  `NULL` rebuilds every current wallet owner.

The public compatibility views retain their existing names:

- `public.daily_portfolio_snapshots`
- `alpha_raw.daily_wallet_token_snapshots`
- `public.portfolio_category_trend_mv`

Readers use these views. Alpha ETL is the only application writer for the two
daily base tables.

## Scheduling and idempotency

There are no snapshot triggers, dirty queues, cache tables, or database cron.
The daily Pipedream job calls `POST /webhooks/jobs`; on-demand wallet refreshes
use the queued wallet webhook. A successful wallet refresh rebuilds only its
`metadata.userId`, while scheduled DeBank and Hyperliquid writes rebuild all
users.

Retries are idempotent because each writer replaces the wallet/day slice in a
single transaction. If the ETL does not run on a day, that date has no snapshot.

## Raw-table retirement

Migration 026 promotes the former daily cache tables, backfills complete idle
wallet-token history, and removes the incremental machinery while retaining the
two raw tables for deployment parity checks. After a cold backup and several
days with no raw writes, migration 027 drops
`public.portfolio_item_snapshots` and `alpha_raw.wallet_token_snapshots` without
`CASCADE`.

Daily history is permanent and has no retention job. Portfolio position growth
is handled by a separate future schema-slimming project, not by deleting daily
history.
