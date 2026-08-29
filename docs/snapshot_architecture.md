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
GitHub Actions runs the daily refresh at 10:00 UTC through
`.github/workflows/alpha-etl-daily-refresh.yml`; on-demand wallet refreshes use
the queued wallet webhook. A successful wallet refresh rebuilds only its
`metadata.userId`, while scheduled DeBank and Hyperliquid writes rebuild all
users.

Which wallets a scheduled batch touches is answered per provider by
`public.get_user_service_states()`. Its `due_sources` column lists the
providers whose last successful refresh of that wallet is older than 20 hours,
or that have never refreshed it at all. The fence is 20 rather than 24 hours
because the daily run's own start time drifts, and a 24-hour fence would skip a
wallet on any day that began a few minutes earlier than the one before. The
state behind it lives in `ops.wallet_source_refresh_state` and is written only
after the load commits: a failed or silently empty batch records its fetched
wallets as failed, which leaves them due for the next run.

`user_crypto_wallets.last_portfolio_update_at` is no longer part of that
decision. It is a DeBank-only display aggregate, stamped after a DeBank load
succeeds and never read for scheduling. One timestamp per wallet cannot say
that DeBank landed today while Hyperliquid did not, so gating both providers on
it meant DeBank running first in the same daily job declared the wallet fresh
and the Hyperliquid slice was skipped every day.

Retries are idempotent because each writer replaces the provider/wallet/day
slice in a single transaction, including successful empty fetches. If the ETL
does not run on a day, that date has no snapshot.

## Raw-table retirement

Migration 026 promoted the former daily cache tables, backfilled complete idle
wallet-token history, and removed the incremental machinery while retaining the
two raw tables for deployment parity checks. Migration 027 then dropped
`public.portfolio_item_snapshots` and `alpha_raw.wallet_token_snapshots` without
`CASCADE`.

The historical `apps/*/migrations/` directories are frozen. New migrations go
through root `supabase/migrations/` as documented in `CONTRIBUTING.md`.

Daily history is permanent and has no retention job. Portfolio position growth
is handled by a separate future schema-slimming project, not by deleting daily
history.
