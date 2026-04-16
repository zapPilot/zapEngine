-- ============================================================================
-- Daily Snapshot Views + Dedup Constraints
-- ============================================================================
-- Creates canonical daily snapshots for analytics consistency:
--   1) public.daily_portfolio_snapshots
--   2) alpha_raw.daily_wallet_token_snapshots
--
-- Also adds unique indexes on base tables to prevent duplicate ETL inserts.
--
-- NOTE: CREATE INDEX CONCURRENTLY cannot run inside a transaction.
-- If your migration runner wraps files in a transaction, run the CONCURRENTLY
-- statements manually.
--
-- Refresh (post-ETL):
--   REFRESH MATERIALIZED VIEW CONCURRENTLY public.daily_portfolio_snapshots;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY alpha_raw.daily_wallet_token_snapshots;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- daily_portfolio_snapshots (latest snapshot per position per UTC day)
-- ----------------------------------------------------------------------------
-- FIXED (Jan 2026): Changed deduplication from wallet-level to position-level.
-- Previously grouped by (wallet, date) and picked MAX(snapshot_at), which
-- excluded protocols with different timestamps (e.g., Hyperliquid arrives
-- ~2 min before DeBank data). Now uses ROW_NUMBER() partitioned by
-- (wallet, id_raw, date) so each position gets its own "latest" independently.
-- See: supabase/migrations/014_fix_daily_portfolio_snapshots_dedup.sql

-- DROP MATERIALIZED VIEW IF EXISTS public.daily_portfolio_snapshots;
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

-- Unique index required for CONCURRENT refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_portfolio_snapshots_id
  ON public.daily_portfolio_snapshots (id);

CREATE INDEX IF NOT EXISTS idx_daily_portfolio_snapshots_wallet_date
  ON public.daily_portfolio_snapshots (wallet, snapshot_date);

-- ----------------------------------------------------------------------------
-- daily_wallet_token_snapshots (latest wallet token snapshot per wallet per day)
-- ----------------------------------------------------------------------------

-- DROP MATERIALIZED VIEW IF EXISTS alpha_raw.daily_wallet_token_snapshots;
CREATE MATERIALIZED VIEW alpha_raw.daily_wallet_token_snapshots AS
WITH latest_daily AS (
  SELECT
    LOWER(user_wallet_address) AS user_wallet_address,
    inserted_at AS snapshot_date,
    MAX(time_at) AS latest_time_at
  FROM alpha_raw.wallet_token_snapshots
  WHERE is_wallet = TRUE
  GROUP BY LOWER(user_wallet_address), inserted_at
)
SELECT
  wts.id,
  LOWER(wts.user_wallet_address) AS user_wallet_address,
  wts.token_address,
  wts.chain,
  wts.name,
  wts.symbol,
  wts.display_symbol,
  wts.optimized_symbol,
  wts.decimals,
  wts.logo_url,
  wts.protocol_id,
  wts.price,
  wts.price_24h_change,
  wts.is_verified,
  wts.is_core,
  wts.is_wallet,
  wts.time_at,
  wts.inserted_at,
  wts.total_supply,
  wts.credit_score,
  wts.amount,
  wts.raw_amount,
  wts.raw_amount_hex_str,
  wts.inserted_at AS snapshot_date
FROM alpha_raw.wallet_token_snapshots wts
JOIN latest_daily ld
  ON LOWER(wts.user_wallet_address) = ld.user_wallet_address
 AND wts.inserted_at = ld.snapshot_date
 AND wts.time_at = ld.latest_time_at
WHERE wts.is_wallet = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_wallet_token_snapshots_id
  ON alpha_raw.daily_wallet_token_snapshots (id);

CREATE INDEX IF NOT EXISTS idx_daily_wallet_token_snapshots_wallet_date
  ON alpha_raw.daily_wallet_token_snapshots (user_wallet_address, snapshot_date);

-- ----------------------------------------------------------------------------
-- Deduplication constraints on base tables (ETL retry protection)
-- ----------------------------------------------------------------------------

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ux_wallet_token_snapshots_dedup
ON alpha_raw.wallet_token_snapshots (
  LOWER(user_wallet_address),
  inserted_at,
  md5(
    COALESCE(token_address, '') || '|' ||
    COALESCE(chain, '') || '|' ||
    COALESCE(symbol, '') || '|' ||
    COALESCE(amount::text, '') || '|' ||
    COALESCE(raw_amount::text, '') || '|' ||
    COALESCE(price::text, '') || '|' ||
    COALESCE(time_at::text, '') || '|' ||
    COALESCE(is_wallet::text, '')
  )
);
