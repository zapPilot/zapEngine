-- ============================================================================
-- Migration 024: Activate incremental portfolio rollups
-- ============================================================================
-- Performs the final legacy refresh/backfill, swaps the three materialized
-- views for security-invoker compatibility views, and keeps the existing
-- 30-minute cron job while changing only its command.
-- ============================================================================

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '15min';

DO $$
DECLARE
  relation_record record;
BEGIN
  FOR relation_record IN
    SELECT *
    FROM (
      VALUES
        ('public', 'daily_portfolio_snapshots'),
        ('alpha_raw', 'daily_wallet_token_snapshots'),
        ('public', 'portfolio_category_trend_mv')
    ) AS expected(schema_name, relation_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = relation_record.schema_name
        AND relation.relname = relation_record.relation_name
        AND relation.relkind = 'm'
    ) THEN
      RAISE EXCEPTION
        'Expected %.% to be a materialized view before activation',
        relation_record.schema_name,
        relation_record.relation_name;
    END IF;
  END LOOP;
END
$$;

REFRESH MATERIALIZED VIEW alpha_raw.daily_wallet_token_snapshots;
REFRESH MATERIALIZED VIEW public.daily_portfolio_snapshots;
REFRESH MATERIALIZED VIEW public.portfolio_category_trend_mv;

TRUNCATE TABLE
  private.daily_portfolio_snapshots_cache,
  private.daily_wallet_token_snapshots_cache,
  private.portfolio_category_trend_cache;

INSERT INTO private.daily_portfolio_snapshots_cache
SELECT *
FROM public.daily_portfolio_snapshots;

INSERT INTO private.daily_wallet_token_snapshots_cache
SELECT *
FROM alpha_raw.daily_wallet_token_snapshots;

INSERT INTO private.portfolio_category_trend_cache
SELECT *
FROM public.portfolio_category_trend_mv;

-- Reconcile writes that triggers queued during the prepare/deploy window.
SELECT *
FROM private.process_portfolio_rollup_queue(50000);

DROP MATERIALIZED VIEW public.portfolio_category_trend_mv;
DROP MATERIALIZED VIEW public.daily_portfolio_snapshots;
DROP MATERIALIZED VIEW alpha_raw.daily_wallet_token_snapshots;

CREATE VIEW public.daily_portfolio_snapshots
WITH (security_invoker = true)
AS
SELECT
  id,
  wallet,
  snapshot_at,
  snapshot_date,
  chain,
  has_supported_portfolio,
  id_raw,
  logo_url,
  name,
  site_url,
  asset_dict,
  asset_token_list,
  detail,
  detail_types,
  pool,
  proxy_detail,
  asset_usd_value,
  debt_usd_value,
  net_usd_value,
  update_at,
  name_item
FROM private.daily_portfolio_snapshots_cache;

CREATE VIEW alpha_raw.daily_wallet_token_snapshots
WITH (security_invoker = true)
AS
SELECT
  id,
  user_wallet_address,
  token_address,
  chain,
  name,
  symbol,
  display_symbol,
  optimized_symbol,
  decimals,
  logo_url,
  protocol_id,
  price,
  price_24h_change,
  is_verified,
  is_core,
  is_wallet,
  time_at,
  inserted_at,
  total_supply,
  credit_score,
  amount,
  raw_amount,
  raw_amount_hex_str,
  snapshot_date
FROM private.daily_wallet_token_snapshots_cache;

CREATE VIEW public.portfolio_category_trend_mv
WITH (security_invoker = true)
AS
SELECT
  user_id,
  date,
  source_type,
  category,
  category_value_usd,
  category_assets_usd,
  category_debt_usd,
  pnl_usd,
  total_value_usd
FROM private.portfolio_category_trend_cache;

REVOKE ALL ON TABLE public.daily_portfolio_snapshots FROM PUBLIC;
REVOKE ALL ON TABLE alpha_raw.daily_wallet_token_snapshots FROM PUBLIC;
REVOKE ALL ON TABLE public.portfolio_category_trend_mv FROM PUBLIC;

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
        'GRANT USAGE ON SCHEMA private TO %I',
        role_name
      );
      EXECUTE pg_catalog.format(
        'GRANT SELECT ON TABLE private.daily_portfolio_snapshots_cache, private.daily_wallet_token_snapshots_cache, private.portfolio_category_trend_cache TO %I',
        role_name
      );
      EXECUTE pg_catalog.format(
        'GRANT SELECT ON TABLE public.daily_portfolio_snapshots, alpha_raw.daily_wallet_token_snapshots, public.portfolio_category_trend_mv TO %I',
        role_name
      );
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  matching_jobs bigint[];
  retained_job_id bigint;
  retained_schedule text;
  incremental_command constant text :=
    'SELECT * FROM private.process_portfolio_rollup_queue();';
BEGIN
  IF pg_catalog.to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'pg_cron is not installed; skipping cron command activation';
    RETURN;
  END IF;

  EXECUTE $query$
    SELECT
      array_agg(jobid ORDER BY jobid),
      min(schedule)
    FROM cron.job
    WHERE jobname = 'refresh_daily_portfolio_snapshots_30m'
  $query$
  INTO matching_jobs, retained_schedule;

  IF COALESCE(pg_catalog.cardinality(matching_jobs), 0) <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one refresh_daily_portfolio_snapshots_30m cron job, found %',
      COALESCE(pg_catalog.cardinality(matching_jobs), 0);
  END IF;

  retained_job_id := matching_jobs[1];

  IF retained_schedule <> '*/30 * * * *' THEN
    RAISE EXCEPTION
      'Refusing to change unexpected cron schedule for job %: %',
      retained_job_id,
      retained_schedule;
  END IF;

  EXECUTE $alter$
    SELECT cron.alter_job(
      job_id := $1,
      command := $2,
      active := true
    )
  $alter$
  USING retained_job_id, incremental_command;
END
$$;

ANALYZE private.daily_portfolio_snapshots_cache;
ANALYZE private.daily_wallet_token_snapshots_cache;
ANALYZE private.portfolio_category_trend_cache;

COMMENT ON VIEW public.daily_portfolio_snapshots IS
  'Compatibility view backed by the private incremental daily portfolio cache.';
COMMENT ON VIEW alpha_raw.daily_wallet_token_snapshots IS
  'Compatibility view backed by the private incremental daily wallet-token cache.';
COMMENT ON VIEW public.portfolio_category_trend_mv IS
  'Compatibility view backed by the private incremental category-trend cache.';
