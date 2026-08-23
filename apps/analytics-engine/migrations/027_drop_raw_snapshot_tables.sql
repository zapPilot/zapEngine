-- ============================================================================
-- Migration 027: Drop the raw snapshot tables
-- ============================================================================
-- Apply ONLY after:
--   1. Migration 026 is applied and the new alpha-etl (direct daily writes)
--      is deployed.
--   2. A cold backup of both tables exists off-database:
--        pg_dump --data-only -t public.portfolio_item_snapshots \
--                -t alpha_raw.wallet_token_snapshots <dsn> | gzip > backup.sql.gz
--   3. Endpoint parity has been verified over several days and the guard
--      below confirms nothing wrote to the raw tables since the deploy.
--
-- Dropping these releases ~1 GB immediately (no VACUUM FULL needed). The
-- canonical daily history lives in analytics.daily_portfolio_positions /
-- analytics.daily_wallet_tokens; raw granularity (multiple batches per day,
-- non-wallet protocol token rows) stops existing outside the cold backup.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '5min';

-- Guard: the legacy ETL wrote these tables until the 026-era deploy; refuse
-- to drop while rows from the last 2 UTC days exist (evidence a writer is
-- still active — an old alpha-etl instance or a direct PostgREST producer).
DO $$
DECLARE
  recent_portfolio_rows bigint;
  recent_wallet_rows bigint;
BEGIN
  IF pg_catalog.to_regclass('public.portfolio_item_snapshots') IS NULL
     AND pg_catalog.to_regclass('alpha_raw.wallet_token_snapshots') IS NULL THEN
    RAISE NOTICE 'Raw snapshot tables already dropped; nothing to do';
    RETURN;
  END IF;

  SELECT pg_catalog.count(*)
  INTO recent_portfolio_rows
  FROM public.portfolio_item_snapshots
  WHERE snapshot_date_utc >= (pg_catalog.now() AT TIME ZONE 'UTC')::date - 1;

  SELECT pg_catalog.count(*)
  INTO recent_wallet_rows
  FROM alpha_raw.wallet_token_snapshots
  WHERE inserted_at >= (pg_catalog.now() AT TIME ZONE 'UTC')::date - 1;

  IF recent_portfolio_rows > 0 OR recent_wallet_rows > 0 THEN
    RAISE EXCEPTION
      'Raw tables received rows in the last 2 UTC days (portfolio %, wallet %); a writer is still active — do not drop yet',
      recent_portfolio_rows,
      recent_wallet_rows;
  END IF;
END
$$;

-- Intentionally no CASCADE: an unanticipated dependency aborts the migration.
DROP TABLE IF EXISTS public.portfolio_item_snapshots;
DROP TABLE IF EXISTS alpha_raw.wallet_token_snapshots;

COMMIT;
