-- ============================================================================
-- ⚠️ WARNING: DO NOT ADD ROW_NUMBER() OR PARTITION BY id_raw DEDUPLICATION ⚠️
-- ============================================================================
-- DeBank's id_raw is PROTOCOL-level, NOT position-level.
-- Multiple distinct positions share the same id_raw.
-- All records in a batch are valid - there's NO duplicate data.
-- See CLAUDE.md "Critical Data Integrity Rules" and tests/test_safeguards_deduplication.py
-- ============================================================================
--
-- Migration 015: Simplify daily_portfolio_snapshots - Latest per protocol
-- ============================================================================
-- Problem: ROW_NUMBER dedup by id_raw loses records because:
--          1. Same id_raw can exist on multiple chains (Morpho on eth/base)
--          2. Multiple positions share same protocol-level id_raw
--             (superOETHb and cbBTC lending both have same Morpho id_raw)
--          3. Multiple ETL pipelines (DeBank, Hyperliquid) have different timestamps
--
-- Fix: Keep ALL records from the latest batch per PROTOCOL per day.
--      No position-level deduplication - data is clean within a batch.
-- ============================================================================
-- Step 1: Drop MVs in dependency order
DROP MATERIALIZED VIEW IF EXISTS public.portfolio_category_trend_mv;
DROP MATERIALIZED VIEW IF EXISTS public.daily_portfolio_snapshots;
-- Step 2: Add index for efficient MAX(snapshot_at) lookup per protocol
CREATE INDEX IF NOT EXISTS idx_pis_wallet_name_snapshot
  ON portfolio_item_snapshots (LOWER(wallet), name, snapshot_at DESC);
-- Step 3: Recreate daily_portfolio_snapshots with per-protocol logic
CREATE MATERIALIZED VIEW public.daily_portfolio_snapshots AS
WITH latest_protocol_batch AS (
  SELECT
    LOWER(wallet) AS wallet,
    name,
    DATE(snapshot_at AT TIME ZONE 'UTC') AS snapshot_date,
    MAX(snapshot_at) AS latest_snapshot_at
  FROM portfolio_item_snapshots
  GROUP BY LOWER(wallet), name, DATE(snapshot_at AT TIME ZONE 'UTC')
)
SELECT
  pis.id,
  LOWER(pis.wallet) AS wallet,
  pis.snapshot_at,
  DATE(pis.snapshot_at AT TIME ZONE 'UTC') AS snapshot_date,
  pis.chain,
  pis.has_supported_portfolio,
  pis.id_raw,
  pis.logo_url,
  pis.name,
  pis.site_url,
  pis.asset_dict,
  pis.asset_token_list,
  pis.detail,
  pis.detail_types,
  pis.pool,
  pis.proxy_detail,
  pis.asset_usd_value,
  pis.debt_usd_value,
  pis.net_usd_value,
  pis.update_at,
  pis.name_item
FROM portfolio_item_snapshots pis
JOIN latest_protocol_batch lpb ON
  LOWER(pis.wallet) = lpb.wallet
  AND pis.name = lpb.name
  AND pis.snapshot_at = lpb.latest_snapshot_at;

-- This one is very important to `REFRESH MATERIALIZED VIEW CONCURRENTLY public.daily_portfolio_snapshots;` . Otherwise we'll get `Error: Failed to run sql query: ERROR: 55000: cannot refresh materialized view "public.daily_portfolio_snapshots" concurrently HINT: Create a unique index with no WHERE clause on one or more columns of the materialized view.`
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_portfolio_snapshots_id
ON public.daily_portfolio_snapshots (id);


-- Step 4: Recreate indexes for daily_portfolio_snapshots
CREATE INDEX idx_daily_portfolio_snapshots_id
  ON public.daily_portfolio_snapshots (id);
CREATE INDEX idx_daily_portfolio_snapshots_wallet_date
  ON public.daily_portfolio_snapshots (wallet, snapshot_date);
-- Step 4: Recreate portfolio_category_trend_mv (unchanged logic)
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
