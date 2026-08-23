-- ============================================================================
-- Migration 026: Daily batch snapshots (cutover, keeps raw tables)
-- ============================================================================
-- The DeBank ETL runs once per day, so the incremental trigger/queue/30-minute
-- cron machinery from migrations 023/024 is retired. alpha-etl now writes the
-- canonical daily tables directly (delete+insert per wallet/UTC day), and the
-- category trends are recomputed by analytics.rebuild_category_trends() right
-- after each write. There is no queue left to drain, so no cron replaces the
-- retired job.
--
-- 1. Drains any queued dirty keys through the legacy processor, then drops
--    the triggers, enqueue functions, dirty queues, processor, and cron job.
-- 2. Promotes private.daily_portfolio_snapshots_cache and
--    private.portfolio_category_trend_cache to canonical analytics tables:
--    they are the permanent daily history, not caches. Never add retention.
-- 3. Replaces the wallet-token daily table outright. The legacy
--    max(time_at) rollup kept ~1 token per wallet/day (time_at is a
--    token-level DeBank attribute, so the join discarded nearly everything);
--    the new analytics.daily_wallet_tokens holds every idle wallet token per
--    wallet/UTC day, slimmed to the columns readers actually use, and is
--    backfilled from the raw history before the raw tables are dropped in 027.
-- 4. public.daily_portfolio_snapshots and public.portfolio_category_trend_mv
--    follow the renames automatically (OID-bound); the wallet-token view is
--    recreated against the new table with the same reader-facing columns.
--
-- Raw tables (public.portfolio_item_snapshots, alpha_raw.wallet_token_snapshots)
-- are intentionally untouched here: the old ETL keeps writing them until the
-- new alpha-etl deploy, and migration 027 drops them after parity checks.
--
-- IMPORTANT: DeBank id_raw is protocol-level, not position-level. The daily
-- portfolio table keeps every row of a day's batch; never add
-- ROW_NUMBER()/DISTINCT ON (id_raw) dedup here.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '15min';

-- ----------------------------------------------------------------------------
-- Guards: refuse to run against an unexpected pre-state.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  relation_record record;
BEGIN
  FOR relation_record IN
    SELECT *
    FROM (
      VALUES
        ('private', 'daily_portfolio_snapshots_cache'),
        ('private', 'daily_wallet_token_snapshots_cache'),
        ('private', 'portfolio_category_trend_cache'),
        ('private', 'portfolio_rollup_dirty_portfolio'),
        ('private', 'portfolio_rollup_dirty_wallet'),
        ('private', 'portfolio_rollup_dirty_users')
    ) AS expected(schema_name, relation_name)
  LOOP
    IF pg_catalog.to_regclass(
      pg_catalog.format(
        '%I.%I',
        relation_record.schema_name,
        relation_record.relation_name
      )
    ) IS NULL THEN
      RAISE EXCEPTION
        'Expected %.% to exist before migration 026 (apply 023/024 first)',
        relation_record.schema_name,
        relation_record.relation_name;
    END IF;
  END LOOP;

  IF pg_catalog.to_regprocedure(
    'private.process_portfolio_rollup_queue(integer)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'Expected private.process_portfolio_rollup_queue(integer) to exist';
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- Drain remaining dirty keys through the legacy processor before removing it.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  drain_result record;
BEGIN
  SELECT *
  INTO drain_result
  FROM private.process_portfolio_rollup_queue(50000);

  IF drain_result.remaining_portfolio_keys > 0
     OR drain_result.remaining_wallet_keys > 0
     OR drain_result.remaining_users > 0 THEN
    RAISE EXCEPTION
      'Dirty queues not fully drained (portfolio %, wallet %, users %); rerun the migration',
      drain_result.remaining_portfolio_keys,
      drain_result.remaining_wallet_keys,
      drain_result.remaining_users;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- Promote the portfolio and trend caches to canonical analytics tables.
-- RENAME + SET SCHEMA carries indexes, RLS, policies, and grants along, and
-- the dependent public views keep working because they reference the OIDs.
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS analytics;
REVOKE ALL ON SCHEMA analytics FROM PUBLIC;

ALTER TABLE private.daily_portfolio_snapshots_cache
  RENAME TO daily_portfolio_positions;
ALTER TABLE private.daily_portfolio_positions SET SCHEMA analytics;

ALTER TABLE private.portfolio_category_trend_cache
  RENAME TO daily_category_trends;
ALTER TABLE private.daily_category_trends SET SCHEMA analytics;

ALTER INDEX analytics.daily_portfolio_snapshots_cache_id_idx
  RENAME TO daily_portfolio_positions_id_idx;
ALTER INDEX analytics.daily_portfolio_snapshots_cache_wallet_date_idx
  RENAME TO daily_portfolio_positions_wallet_date_idx;
ALTER INDEX analytics.portfolio_category_trend_cache_uniq_idx
  RENAME TO daily_category_trends_uniq_idx;
ALTER INDEX analytics.portfolio_category_trend_cache_user_date_idx
  RENAME TO daily_category_trends_user_date_idx;
ALTER INDEX analytics.portfolio_category_trend_cache_user_category_idx
  RENAME TO daily_category_trends_user_category_idx;
ALTER INDEX analytics.portfolio_category_trend_cache_user_source_idx
  RENAME TO daily_category_trends_user_source_idx;

ALTER POLICY daily_portfolio_snapshots_cache_select
  ON analytics.daily_portfolio_positions
  RENAME TO daily_portfolio_positions_select;
ALTER POLICY portfolio_category_trend_cache_select
  ON analytics.daily_category_trends
  RENAME TO daily_category_trends_select;

-- alpha-etl now inserts directly; rows need a generated id.
ALTER TABLE analytics.daily_portfolio_positions
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- ----------------------------------------------------------------------------
-- New canonical wallet-token daily table (slim), backfilled from raw history.
-- One row per idle wallet token per wallet/UTC day.
-- ----------------------------------------------------------------------------
CREATE TABLE analytics.daily_wallet_tokens (
  user_wallet_address text NOT NULL,
  token_address text NOT NULL,
  chain text NOT NULL,
  symbol text,
  amount numeric,
  price numeric,
  snapshot_date date NOT NULL,
  PRIMARY KEY (user_wallet_address, token_address, chain, snapshot_date)
);

ALTER TABLE analytics.daily_wallet_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY daily_wallet_tokens_select
  ON analytics.daily_wallet_tokens
  FOR SELECT
  TO PUBLIC
  USING (true);

REVOKE ALL ON TABLE analytics.daily_wallet_tokens FROM PUBLIC;

-- Backfill every idle wallet token from the raw history (the legacy daily
-- cache kept ~1 token per wallet/day and is discarded as lossy).
INSERT INTO analytics.daily_wallet_tokens (
  user_wallet_address,
  token_address,
  chain,
  symbol,
  amount,
  price,
  snapshot_date
)
SELECT
  pg_catalog.lower(wts.user_wallet_address),
  wts.token_address,
  wts.chain,
  wts.symbol,
  wts.amount,
  wts.price,
  wts.inserted_at
FROM alpha_raw.wallet_token_snapshots AS wts
WHERE wts.is_wallet IS TRUE
  AND wts.token_address IS NOT NULL
ON CONFLICT (user_wallet_address, token_address, chain, snapshot_date)
  DO NOTHING;

DROP VIEW alpha_raw.daily_wallet_token_snapshots;

CREATE VIEW alpha_raw.daily_wallet_token_snapshots
WITH (security_invoker = true)
AS
SELECT
  user_wallet_address,
  token_address,
  chain,
  symbol,
  amount,
  price,
  TRUE AS is_wallet,
  snapshot_date,
  snapshot_date AS inserted_at
FROM analytics.daily_wallet_tokens;

DROP TABLE private.daily_wallet_token_snapshots_cache;

-- ----------------------------------------------------------------------------
-- Category trend rebuild: pnl_usd uses lag() across days, so trends are
-- recomputed per user over that user's full daily history. alpha-etl calls
-- this after every write (scoped to the fetched wallet for on-demand jobs,
-- unscoped for the daily batch, which also clears trends of removed wallets).
-- ----------------------------------------------------------------------------
CREATE FUNCTION analytics.rebuild_category_trends(
  p_user_ids text[] DEFAULT NULL
)
RETURNS TABLE (
  users_processed bigint,
  trend_rows_written bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user_ids text[];
BEGIN
  IF p_user_ids IS NOT NULL
     AND pg_catalog.cardinality(p_user_ids) = 0 THEN
    RAISE EXCEPTION 'p_user_ids must not be empty when provided';
  END IF;

  IF p_user_ids IS NULL THEN
    SELECT pg_catalog.array_agg(DISTINCT wallets.user_id::text)
    INTO v_user_ids
    FROM public.user_crypto_wallets AS wallets;
  ELSE
    SELECT pg_catalog.array_agg(DISTINCT requested.user_id)
    INTO v_user_ids
    FROM pg_catalog.unnest(p_user_ids) AS requested(user_id);
  END IF;

  users_processed := COALESCE(pg_catalog.cardinality(v_user_ids), 0);
  trend_rows_written := 0;

  IF v_user_ids IS NULL THEN
    RETURN NEXT;
    RETURN;
  END IF;

  -- ETL calls and manual runs share this writer; a concurrent caller waits,
  -- then recomputes idempotently.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('analytics.rebuild_category_trends', 0)
  );

  DELETE FROM analytics.daily_category_trends AS trends
  WHERE trends.user_id::text = ANY (v_user_ids);

  WITH user_wallets AS (
    SELECT wallets.user_id, pg_catalog.lower(wallets.wallet) AS wallet
    FROM public.user_crypto_wallets AS wallets
    WHERE wallets.user_id::text = ANY (v_user_ids)
  ),
  portfolio_snapshots AS (
    SELECT
      wallets.user_id,
      snapshots.wallet,
      snapshots.snapshot_at,
      snapshots.asset_token_list
    FROM analytics.daily_portfolio_positions AS snapshots
    JOIN user_wallets AS wallets
      ON snapshots.wallet = wallets.wallet
  ),
  defi_tokens AS (
    SELECT
      snapshots.user_id,
      (snapshots.snapshot_at AT TIME ZONE 'UTC')::date AS bucket_date,
      'defi'::text AS source_type,
      public.classify_token_category(token.value ->> 'symbol') AS category,
      (
        COALESCE(
          (token.value ->> 'amount')::numeric,
          0::numeric
        )
        *
        COALESCE(
          (token.value ->> 'price')::numeric,
          0::numeric
        )
      ) AS token_value
    FROM portfolio_snapshots AS snapshots
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
      snapshots.asset_token_list
    ) AS token(value)
    WHERE snapshots.asset_token_list IS NOT NULL
      AND pg_catalog.jsonb_array_length(snapshots.asset_token_list) > 0
  ),
  wallet_tokens AS (
    SELECT
      wallets.user_id,
      snapshots.snapshot_date AS bucket_date,
      'wallet'::text AS source_type,
      public.classify_token_category(snapshots.symbol) AS category,
      (
        COALESCE(snapshots.amount, 0::numeric)
        * COALESCE(snapshots.price, 0::numeric)
      ) AS token_value
    FROM analytics.daily_wallet_tokens AS snapshots
    JOIN user_wallets AS wallets
      ON snapshots.user_wallet_address = wallets.wallet
  ),
  all_tokens AS (
    SELECT *
    FROM defi_tokens
    WHERE token_value <> 0::numeric
    UNION ALL
    SELECT *
    FROM wallet_tokens
    WHERE token_value <> 0::numeric
  ),
  daily_aggregation AS (
    SELECT
      tokens.user_id,
      tokens.bucket_date,
      tokens.source_type,
      tokens.category,
      pg_catalog.sum(
        CASE
          WHEN tokens.token_value > 0::numeric THEN tokens.token_value
          ELSE 0::numeric
        END
      ) AS category_assets_usd,
      pg_catalog.sum(
        CASE
          WHEN tokens.token_value < 0::numeric
            THEN pg_catalog.abs(tokens.token_value)
          ELSE 0::numeric
        END
      ) AS category_debt_usd,
      pg_catalog.sum(tokens.token_value) AS category_value_usd
    FROM all_tokens AS tokens
    GROUP BY
      tokens.user_id,
      tokens.bucket_date,
      tokens.source_type,
      tokens.category
  ),
  daily_totals AS (
    SELECT
      daily.user_id,
      daily.bucket_date,
      pg_catalog.sum(daily.category_value_usd) AS total_value_usd
    FROM daily_aggregation AS daily
    GROUP BY daily.user_id, daily.bucket_date
  ),
  with_window_metrics AS (
    SELECT
      daily.user_id,
      daily.bucket_date,
      daily.source_type,
      daily.category,
      daily.category_value_usd,
      daily.category_assets_usd,
      daily.category_debt_usd,
      pg_catalog.lag(daily.category_value_usd) OVER (
        PARTITION BY daily.user_id, daily.source_type, daily.category
        ORDER BY daily.bucket_date
      ) AS prev_value_usd,
      totals.total_value_usd
    FROM daily_aggregation AS daily
    JOIN daily_totals AS totals
      ON daily.user_id = totals.user_id
     AND daily.bucket_date = totals.bucket_date
  )
  INSERT INTO analytics.daily_category_trends (
    user_id,
    date,
    source_type,
    category,
    category_value_usd,
    category_assets_usd,
    category_debt_usd,
    pnl_usd,
    total_value_usd
  )
  SELECT
    metrics.user_id,
    metrics.bucket_date,
    metrics.source_type,
    metrics.category,
    metrics.category_value_usd,
    metrics.category_assets_usd,
    metrics.category_debt_usd,
    COALESCE(
      metrics.category_value_usd - metrics.prev_value_usd,
      0::numeric
    ),
    metrics.total_value_usd
  FROM with_window_metrics AS metrics;

  GET DIAGNOSTICS trend_rows_written = ROW_COUNT;

  RETURN NEXT;
END
$$;

REVOKE ALL ON FUNCTION analytics.rebuild_category_trends(text[]) FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- Dismantle the incremental machinery.
-- Intentionally no IF EXISTS / CASCADE: the guards above proved the pre-state,
-- and an unanticipated dependency must abort the migration.
-- ----------------------------------------------------------------------------
DROP TRIGGER enqueue_portfolio_snapshot_rollup
  ON public.portfolio_item_snapshots;
DROP TRIGGER enqueue_wallet_token_snapshot_rollup
  ON alpha_raw.wallet_token_snapshots;
DROP TRIGGER enqueue_user_wallet_rollup
  ON public.user_crypto_wallets;

DROP FUNCTION private.enqueue_portfolio_snapshot_rollup();
DROP FUNCTION private.enqueue_wallet_token_snapshot_rollup();
DROP FUNCTION private.enqueue_user_wallet_rollup();
DROP FUNCTION private.process_portfolio_rollup_queue(integer);

DROP TABLE private.portfolio_rollup_dirty_portfolio;
DROP TABLE private.portfolio_rollup_dirty_wallet;
DROP TABLE private.portfolio_rollup_dirty_users;

DO $$
DECLARE
  matching_job record;
BEGIN
  IF pg_catalog.to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'pg_cron is not installed; skipping cron changes';
    RETURN;
  END IF;

  FOR matching_job IN EXECUTE $query$
    SELECT jobid, jobname
    FROM cron.job
    WHERE jobname = 'refresh_daily_portfolio_snapshots_30m'
    ORDER BY jobid
  $query$
  LOOP
    RAISE NOTICE
      'Unscheduling retired rollup cron job % (%)',
      matching_job.jobid,
      matching_job.jobname;
    EXECUTE 'SELECT cron.unschedule($1)' USING matching_job.jobid;
  END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- Grants: mirror the 024 role list on the analytics schema; the ETL role
-- additionally writes the two daily tables directly and runs the trend
-- rebuild.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'postgres',
    'alpha_etl_user',
    'readonly_user',
    'anon',
    'authenticated',
    'service_role'
  ]::text[]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles
      WHERE rolname = role_name
    ) THEN
      EXECUTE pg_catalog.format(
        'GRANT USAGE ON SCHEMA analytics TO %I',
        role_name
      );
      EXECUTE pg_catalog.format(
        'GRANT SELECT ON TABLE analytics.daily_portfolio_positions, analytics.daily_wallet_tokens, analytics.daily_category_trends TO %I',
        role_name
      );
      EXECUTE pg_catalog.format(
        'GRANT SELECT ON TABLE alpha_raw.daily_wallet_token_snapshots TO %I',
        role_name
      );
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'alpha_etl_user'
  ) THEN
    GRANT INSERT, DELETE
      ON TABLE analytics.daily_portfolio_positions, analytics.daily_wallet_tokens
      TO alpha_etl_user;
    GRANT EXECUTE
      ON FUNCTION analytics.rebuild_category_trends(text[])
      TO alpha_etl_user;
  END IF;

  GRANT EXECUTE
    ON FUNCTION analytics.rebuild_category_trends(text[])
    TO postgres;
END
$$;

-- RLS is enabled on the direct-write tables and alpha_etl_user is not their
-- owner, so its DML needs explicit policies (reads stay covered by the
-- SELECT-to-PUBLIC policies above).
CREATE POLICY daily_portfolio_positions_etl_write
  ON analytics.daily_portfolio_positions
  FOR ALL
  TO alpha_etl_user
  USING (true)
  WITH CHECK (true);

CREATE POLICY daily_wallet_tokens_etl_write
  ON analytics.daily_wallet_tokens
  FOR ALL
  TO alpha_etl_user
  USING (true)
  WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- Recompute all trends once: the backfilled wallet-token history replaces the
-- lossy legacy aggregate, completing the 'wallet' source series.
-- ----------------------------------------------------------------------------
SELECT * FROM analytics.rebuild_category_trends();

ANALYZE analytics.daily_portfolio_positions;
ANALYZE analytics.daily_wallet_tokens;
ANALYZE analytics.daily_category_trends;

COMMENT ON TABLE analytics.daily_portfolio_positions IS
  'Canonical daily portfolio positions: every row of the day''s DeBank/Hyperliquid batch per wallet/UTC day (alpha-etl replaces the wallet/day slice on each write). Permanent history — never add retention.';
COMMENT ON TABLE analytics.daily_wallet_tokens IS
  'Canonical daily idle-wallet token balances: one row per token per wallet/UTC day, slimmed to reader-used columns. Permanent history — never add retention.';
COMMENT ON TABLE analytics.daily_category_trends IS
  'Canonical per-user daily category trend series derived from the daily tables by analytics.rebuild_category_trends(); pnl_usd depends on the previous day, so users are always recomputed over full history.';
COMMENT ON FUNCTION analytics.rebuild_category_trends(text[]) IS
  'Recomputes analytics.daily_category_trends for the given users (NULL = every user in user_crypto_wallets) from the canonical daily tables.';

COMMENT ON VIEW public.daily_portfolio_snapshots IS
  'Stable read interface over analytics.daily_portfolio_positions.';
COMMENT ON VIEW alpha_raw.daily_wallet_token_snapshots IS
  'Stable read interface over analytics.daily_wallet_tokens.';
COMMENT ON VIEW public.portfolio_category_trend_mv IS
  'Stable read interface over analytics.daily_category_trends.';

COMMIT;
