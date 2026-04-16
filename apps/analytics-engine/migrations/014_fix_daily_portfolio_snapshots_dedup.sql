-- ============================================================================
-- Migration: Fix daily_portfolio_snapshots deduplication logic
-- ============================================================================
-- Problem: Hyperliquid data excluded because it has a different timestamp
--          than DeBank protocols on the same day.
--
-- Root Cause: MV groups by (wallet, date) and picks MAX(snapshot_at),
--             then JOINs on exact timestamp match. Hyperliquid's earlier
--             timestamp (10:02:39) != MAX (10:04:19), so it's filtered out.
--
-- Fix: Partition by (wallet, id_raw, date) so each position gets its own
--      "latest" independently.
-- ============================================================================

-- Step 1: Drop MVs in dependency order
-- portfolio_category_trend_mv depends on daily_portfolio_snapshots
DROP MATERIALIZED VIEW IF EXISTS public.portfolio_category_trend_mv;
DROP MATERIALIZED VIEW IF EXISTS public.daily_portfolio_snapshots;

-- Step 2: Recreate daily_portfolio_snapshots with FIXED deduplication logic
-- Using ROW_NUMBER() partitioned by position (id_raw), not just wallet
CREATE MATERIALIZED VIEW public.daily_portfolio_snapshots AS
WITH ranked_snapshots AS (
  SELECT
    pis.*,
    DATE(pis.snapshot_at AT TIME ZONE 'UTC') AS snapshot_date,
    ROW_NUMBER() OVER (
      PARTITION BY
        LOWER(pis.wallet),
        pis.id_raw,  -- Partition by position, not just wallet
        DATE(pis.snapshot_at AT TIME ZONE 'UTC')
      ORDER BY
        pis.snapshot_at DESC
    ) AS rn
  FROM public.portfolio_item_snapshots pis
)
SELECT
  id,
  LOWER(wallet) AS wallet,
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
FROM ranked_snapshots
WHERE rn = 1;

-- Step 3: Recreate indexes for daily_portfolio_snapshots
CREATE UNIQUE INDEX idx_daily_portfolio_snapshots_id
  ON public.daily_portfolio_snapshots (id);

CREATE INDEX idx_daily_portfolio_snapshots_wallet_date
  ON public.daily_portfolio_snapshots (wallet, snapshot_date);

-- Step 4: Recreate portfolio_category_trend_mv
-- Full definition from create_portfolio_category_trend_mv.sql
CREATE MATERIALIZED VIEW portfolio_category_trend_mv AS
WITH user_wallets AS (
  SELECT user_id, LOWER(wallet) AS wallet
  FROM user_crypto_wallets
),
portfolio_snapshots AS (
  SELECT uw.user_id, dps.wallet, dps.snapshot_at, dps.asset_token_list
  FROM daily_portfolio_snapshots dps
  JOIN user_wallets uw ON dps.wallet = uw.wallet
),
defi_tokens AS (
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
  SELECT * FROM defi_tokens WHERE token_value <> 0
  UNION ALL
  SELECT * FROM wallet_tokens WHERE token_value <> 0
),
daily_aggregation AS (
  SELECT
    user_id, bucket_date, source_type, category,
    SUM(CASE WHEN token_value > 0 THEN token_value ELSE 0 END) AS category_assets_usd,
    SUM(CASE WHEN token_value < 0 THEN ABS(token_value) ELSE 0 END) AS category_debt_usd,
    SUM(token_value) AS category_value_usd
  FROM all_tokens
  GROUP BY user_id, bucket_date, source_type, category
),
daily_totals AS (
  SELECT user_id, bucket_date, SUM(category_value_usd) AS total_value_usd
  FROM daily_aggregation
  GROUP BY user_id, bucket_date
),
with_window_metrics AS (
  SELECT
    da.user_id, da.bucket_date, da.source_type, da.category,
    da.category_value_usd, da.category_assets_usd, da.category_debt_usd,
    LAG(da.category_value_usd) OVER (
      PARTITION BY da.user_id, da.source_type, da.category ORDER BY da.bucket_date
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

-- Step 5: Recreate indexes for portfolio_category_trend_mv
CREATE UNIQUE INDEX portfolio_category_trend_mv_uniq
    ON portfolio_category_trend_mv (user_id, date, category, source_type);

CREATE INDEX idx_portfolio_category_trend_user_date
    ON portfolio_category_trend_mv (user_id, date DESC);

CREATE INDEX idx_portfolio_category_trend_user_category
    ON portfolio_category_trend_mv (user_id, category);

CREATE INDEX idx_portfolio_category_trend_user_source
    ON portfolio_category_trend_mv (user_id, source_type);
