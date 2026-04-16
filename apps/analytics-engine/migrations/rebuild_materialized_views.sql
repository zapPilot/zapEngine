-- ============================================================================
-- Materialized View Rebuild Script
-- ============================================================================
-- Execute this script via Supabase SQL Editor to rebuild all materialized views
-- with the updated daily snapshot views.
--
-- Estimated Duration: 10-15 minutes (depending on data volume)
-- Downtime: None (CONCURRENTLY allows queries during refresh)
--
-- Prerequisites:
--   1. Migration 013 (daily snapshot views) must be applied
--   2. Database should have recent ETL data
--
-- Execution Steps:
--   1. Copy this entire script
--   2. Open Supabase SQL Editor
--   3. Paste and execute
--   4. Verify results at the end
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1: Verify Daily Snapshot Views Exist
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    -- Check daily_portfolio_snapshots
    IF NOT EXISTS (
        SELECT 1 FROM pg_matviews
        WHERE schemaname = 'public'
          AND matviewname = 'daily_portfolio_snapshots'
    ) THEN
        RAISE EXCEPTION 'daily_portfolio_snapshots MV does not exist! Run migration 013 first.';
    END IF;

    -- Check daily_wallet_token_snapshots
    IF NOT EXISTS (
        SELECT 1 FROM pg_matviews
        WHERE schemaname = 'alpha_raw'
          AND matviewname = 'daily_wallet_token_snapshots'
    ) THEN
        RAISE EXCEPTION 'daily_wallet_token_snapshots MV does not exist! Run migration 013 first.';
    END IF;

    RAISE NOTICE '✓ Daily snapshot views exist';
END $$;

-- ----------------------------------------------------------------------------
-- STEP 2: Refresh Daily Snapshot Views (Layer 1)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE 'Refreshing daily_portfolio_snapshots...';
END $$;

REFRESH MATERIALIZED VIEW CONCURRENTLY public.daily_portfolio_snapshots;

DO $$
BEGIN
    RAISE NOTICE '✓ daily_portfolio_snapshots refreshed';
    RAISE NOTICE 'Refreshing daily_wallet_token_snapshots...';
END $$;

REFRESH MATERIALIZED VIEW CONCURRENTLY alpha_raw.daily_wallet_token_snapshots;

DO $$
BEGIN
    RAISE NOTICE '✓ daily_wallet_token_snapshots refreshed';
END $$;

-- ----------------------------------------------------------------------------
-- STEP 3: Drop and Recreate portfolio_category_trend_mv (Layer 2)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE 'Dropping portfolio_category_trend_mv...';
END $$;

DROP MATERIALIZED VIEW IF EXISTS portfolio_category_trend_mv;

DO $$
BEGIN
    RAISE NOTICE '✓ portfolio_category_trend_mv dropped';
    RAISE NOTICE 'Creating portfolio_category_trend_mv with updated definition...';
END $$;
-- Paste the full MV definition from create_portfolio_category_trend_mv.sql here
-- (Lines 27-143 from that file)

CREATE MATERIALIZED VIEW portfolio_category_trend_mv AS
WITH user_wallets AS (
  -- Get ALL users' wallets (no WHERE user_id filter)
  -- This allows the MV to serve all users
  SELECT
    user_id,
    LOWER(wallet) AS wallet
  FROM user_crypto_wallets
),
portfolio_snapshots AS (
  -- Fetch all snapshots from daily_portfolio_snapshots (deduped)
  SELECT
    uw.user_id,
    dps.wallet,
    dps.snapshot_at,
    dps.asset_token_list
  FROM daily_portfolio_snapshots dps
  JOIN user_wallets uw ON dps.wallet = uw.wallet
),
defi_tokens AS (
  -- Extract tokens from DeFi positions
  SELECT
    ps.user_id,
    (ps.snapshot_at AT TIME ZONE 'UTC')::date AS bucket_date,
    'defi' AS source_type,
    classify_token_category(token->>'symbol') AS category,
    (COALESCE((token->>'amount')::numeric, 0) * COALESCE((token->>'price')::numeric, 0)) AS token_value
  FROM portfolio_snapshots ps
  CROSS JOIN LATERAL jsonb_array_elements(ps.asset_token_list) AS token
  WHERE ps.asset_token_list IS NOT NULL
    AND jsonb_array_length(ps.asset_token_list) > 0
),
wallet_tokens AS (
  -- Extract tokens from idle wallet positions
  SELECT
    uw.user_id,
    DATE_TRUNC('day', dwt.inserted_at)::date AS bucket_date,
    'wallet' AS source_type,
    classify_token_category(dwt.symbol) AS category,
    (COALESCE(dwt.amount, 0) * COALESCE(dwt.price, 0)) AS token_value
  FROM alpha_raw.daily_wallet_token_snapshots dwt
  JOIN user_wallets uw ON dwt.user_wallet_address = uw.wallet
  WHERE dwt.is_wallet = TRUE
),
all_tokens AS (
  -- Combine DeFi and wallet tokens
  SELECT * FROM defi_tokens WHERE token_value <> 0
  UNION ALL
  SELECT * FROM wallet_tokens WHERE token_value <> 0
),
daily_aggregation AS (
  -- Aggregate to daily buckets with category/source breakdown
  SELECT
    user_id,
    bucket_date,
    source_type,
    category,
    SUM(CASE WHEN token_value > 0 THEN token_value ELSE 0 END) AS category_assets_usd,
    SUM(CASE WHEN token_value < 0 THEN ABS(token_value) ELSE 0 END) AS category_debt_usd,
    SUM(token_value) AS category_value_usd
  FROM all_tokens
  GROUP BY user_id, bucket_date, source_type, category
),
daily_totals AS (
  -- Calculate daily total portfolio value
  SELECT
    user_id,
    bucket_date,
    SUM(category_value_usd) AS total_value_usd
  FROM daily_aggregation
  GROUP BY user_id, bucket_date
),
with_window_metrics AS (
  -- Compute window functions for P&L calculation
  SELECT
    da.user_id,
    da.bucket_date,
    da.source_type,
    da.category,
    da.category_value_usd,
    da.category_assets_usd,
    da.category_debt_usd,
    LAG(da.category_value_usd) OVER (
      PARTITION BY da.user_id, da.source_type, da.category
      ORDER BY da.bucket_date
    ) AS prev_value_usd,
    dt.total_value_usd
  FROM daily_aggregation da
  JOIN daily_totals dt ON da.user_id = dt.user_id AND da.bucket_date = dt.bucket_date
)
SELECT
  user_id,
  bucket_date AS date,
  source_type,
  category,
  category_value_usd,
  category_assets_usd,
  category_debt_usd,
  COALESCE(category_value_usd - prev_value_usd, 0) AS pnl_usd,
  total_value_usd
FROM with_window_metrics
ORDER BY user_id, date ASC, category ASC, source_type ASC;

DO $$
BEGIN
    RAISE NOTICE '✓ portfolio_category_trend_mv created';
END $$;

-- ----------------------------------------------------------------------------
-- STEP 4: Create Indexes
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE 'Creating indexes on portfolio_category_trend_mv...';
END $$;

-- Unique index required for CONCURRENT refresh (wallet + defi rows coexist)
CREATE UNIQUE INDEX portfolio_category_trend_mv_uniq
    ON portfolio_category_trend_mv (user_id, date, category, source_type);

CREATE INDEX idx_portfolio_category_trend_user_date
    ON portfolio_category_trend_mv (user_id, date DESC);

CREATE INDEX idx_portfolio_category_trend_user_category
    ON portfolio_category_trend_mv (user_id, category);

CREATE INDEX idx_portfolio_category_trend_user_source
    ON portfolio_category_trend_mv (user_id, source_type);

DO $$
BEGIN
    RAISE NOTICE '✓ Indexes created';
END $$;

-- ----------------------------------------------------------------------------
-- STEP 5: Initial Refresh (Populate Data)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE 'Refreshing portfolio_category_trend_mv (this may take 5-10 minutes)...';
END $$;

REFRESH MATERIALIZED VIEW portfolio_category_trend_mv;

DO $$
BEGIN
    RAISE NOTICE '✓ portfolio_category_trend_mv refreshed';
END $$;

-- ----------------------------------------------------------------------------
-- STEP 6: Verification
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Verification Results';
    RAISE NOTICE '========================================';
END $$;

-- Check daily_portfolio_snapshots
SELECT
  'daily_portfolio_snapshots' AS view_name,
  COUNT(*) AS total_rows,
  COUNT(DISTINCT wallet) AS unique_wallets,
  MIN(snapshot_at) AS earliest_snapshot,
  MAX(snapshot_at) AS latest_snapshot
FROM daily_portfolio_snapshots;

-- Check daily_wallet_token_snapshots
SELECT
  'daily_wallet_token_snapshots' AS view_name,
  COUNT(*) AS total_rows,
  COUNT(DISTINCT user_wallet_address) AS unique_wallets,
  MIN(inserted_at) AS earliest_snapshot,
  MAX(inserted_at) AS latest_snapshot
FROM alpha_raw.daily_wallet_token_snapshots;

-- Check portfolio_category_trend_mv
SELECT
  'portfolio_category_trend_mv' AS view_name,
  COUNT(*) AS total_rows,
  COUNT(DISTINCT user_id) AS unique_users,
  MIN(date) AS earliest_date,
  MAX(date) AS latest_date
FROM portfolio_category_trend_mv;

-- Sample data from portfolio_category_trend_mv (top 10 users by date)
SELECT
  user_id,
  MIN(date) AS earliest_date,
  MAX(date) AS latest_date,
  COUNT(*) AS row_count
FROM portfolio_category_trend_mv
GROUP BY user_id
ORDER BY MAX(date) DESC
LIMIT 10;

-- Check for duplicate snapshots (should return 0)
SELECT
  COUNT(*) AS duplicate_count
FROM (
  SELECT
    wallet,
    (snapshot_at AT TIME ZONE 'UTC')::date AS snapshot_date,
    COUNT(DISTINCT snapshot_at) AS snapshot_count
  FROM daily_portfolio_snapshots
  GROUP BY wallet, (snapshot_at AT TIME ZONE 'UTC')::date
  HAVING COUNT(DISTINCT snapshot_at) > 1
) duplicates;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Rebuild Complete!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Next Steps:';
    RAISE NOTICE '1. Verify verification results above';
    RAISE NOTICE '2. Check that duplicate_count = 0';
    RAISE NOTICE '3. Deploy application with updated services';
    RAISE NOTICE '4. Monitor query performance (expect 5-15ms for MV queries)';
    RAISE NOTICE '5. Schedule daily MV refresh post-ETL';
    RAISE NOTICE '';
END $$;
