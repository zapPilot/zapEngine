-- ============================================================================
-- PORTFOLIO CATEGORY TREND BY USER
-- ============================================================================
-- Calculates daily portfolio trends aggregated by token category (btc, eth,
-- stablecoins, others) combining both DeFi positions and idle wallet tokens.
--
-- Key Features:
--   1. Combines DeFi positions from daily_portfolio_snapshots
--   2. Includes idle wallet tokens from alpha_raw.daily_wallet_token_snapshots
--   3. Categorizes all tokens using classify_token_category() function
--   4. Aggregates by date + source_type + category
--   5. Tracks P&L by category over time
--   6. Properly handles debt positions (negative token values) by:
--      - Including all token values (positive and negative)
--      - Separating assets (positive) from debt (negative)
--      - Computing net category values (assets - debt)
--
-- Parameters:
--   :user_id (UUID) - User identifier for portfolio filtering
--   :wallet_address (TEXT, optional) - Specific wallet address to filter by (NULL = all user wallets)
--   :start_date (TIMESTAMP) - Analysis start date (inclusive)
--   :end_date (TIMESTAMP) - Analysis end date (exclusive)
--
-- Output:
--   Daily portfolio values aggregated by category with:
--   - Category NET value per source combination (assets minus debt)
--   - Daily P&L (change from previous day)
--   - Total portfolio NET value per day (across all categories)
--   - Source type (defi/wallet) to distinguish position types
--
-- Prerequisites:
--   - Index on daily_portfolio_snapshots (wallet, snapshot_date)
--   - Index on daily_wallet_token_snapshots (user_wallet_address, snapshot_date)
--   - Index on user_crypto_wallets (user_id, wallet)
--   - Database function: classify_token_category(symbol TEXT)
--
-- Performance Optimization (v2):
--   - Moved daily total calculation to separate CTE (daily_totals)
--   - Eliminated redundant SUM() OVER (PARTITION BY bucket_date) computation
--   - Previous: total calculated N times per date (once per row)
--   - Optimized: total calculated once per date, joined back
--   - Expected gain: ~50-100ms for queries with 1000+ rows
--
-- Data Quality (v7 - Canonical Daily Snapshots):
--   - Uses daily_portfolio_snapshots + daily_wallet_token_snapshots views
--   - Keeps only the latest snapshot per wallet per UTC day
--   - Handles ETL retries that insert duplicate daily batches
--   - Does NOT merge distinct positions within a single snapshot
--   - Multiple positions with same name_item remain separate
--   - Example: Frax has 4 "Locked" positions with different unlock_at dates
--   - Example: GMX V2 has multiple "Liquidity Pool" positions with different tokens
-- ============================================================================

-- ============================================================================
-- SECTION 1: INPUT FILTERING CTES
-- ============================================================================
-- Purpose: Filter raw data to relevant scope (user wallets and date range)
-- ============================================================================

WITH user_wallets AS (
  -- Get all wallet addresses associated with the user (or filter to specific wallet if provided)
  SELECT DISTINCT LOWER(wallet) AS wallet
  FROM user_crypto_wallets
  WHERE user_id = :user_id
    AND (CAST(:wallet_address AS TEXT) IS NULL OR lower(wallet) = lower(CAST(:wallet_address AS TEXT)))
),
portfolio_snapshots AS (
  -- Multiple positions with same name_item are separate positions (different unlock dates, tokens, etc.)
  -- Daily snapshot view already deduplicates ETL retries
  SELECT
    dps.wallet,
    dps.snapshot_at,
    dps.asset_token_list
  FROM daily_portfolio_snapshots dps
  JOIN user_wallets uw ON dps.wallet = uw.wallet
  WHERE dps.snapshot_at >= :start_date
    AND dps.snapshot_at < :end_date
),

-- ============================================================================
-- SECTION 2: DEFI POSITION TRANSFORMATION
-- ============================================================================
-- Purpose: Extract and categorize tokens from DeFi protocol positions
-- ============================================================================

defi_tokens AS (
  -- Extract tokens from DeFi positions (asset_token_list JSONB array)
  -- Each portfolio position may contain multiple tokens
  -- Uses daily snapshot view to avoid ETL retry inflation
  SELECT
    (ps.snapshot_at AT TIME ZONE 'UTC')::date AS bucket_date,
    'defi' AS source_type,
    classify_token_category(token->>'symbol') AS category,
    (COALESCE((token->>'amount')::numeric, 0) * COALESCE((token->>'price')::numeric, 0)) AS token_value
  FROM portfolio_snapshots ps
  CROSS JOIN LATERAL jsonb_array_elements(ps.asset_token_list) AS token
  WHERE ps.asset_token_list IS NOT NULL
    AND jsonb_array_length(ps.asset_token_list) > 0
),

-- ============================================================================
-- SECTION 3: WALLET TOKEN TRANSFORMATION
-- ============================================================================
-- Purpose: Extract and categorize idle wallet tokens (non-DeFi)
-- ============================================================================

wallet_tokens AS (
  -- Extract tokens from idle wallet positions (not in DeFi protocols)
  -- These are tokens sitting in the wallet earning no yield
  SELECT
    DATE_TRUNC('day', dwt.inserted_at)::date AS bucket_date,
    'wallet' AS source_type,
    classify_token_category(dwt.symbol) AS category,
    (COALESCE(dwt.amount, 0) * COALESCE(dwt.price, 0)) AS token_value
  FROM alpha_raw.daily_wallet_token_snapshots dwt
  JOIN user_wallets uw ON dwt.user_wallet_address = uw.wallet
  WHERE dwt.inserted_at >= CAST(:start_date AS DATE)
    AND dwt.inserted_at < CAST(:end_date AS DATE)
    AND dwt.is_wallet = TRUE
),

-- ============================================================================
-- SECTION 4: UNION AND AGGREGATION
-- ============================================================================
-- Purpose: Combine DeFi and wallet tokens, aggregate by category/source/date
-- ============================================================================

all_tokens AS (
  -- Combine DeFi and wallet tokens, INCLUDING negative values (debt positions)
  -- Previously filtered WHERE token_value > 0, which excluded debt and inflated portfolio values
  SELECT * FROM defi_tokens WHERE token_value <> 0
  UNION ALL
  SELECT * FROM wallet_tokens WHERE token_value <> 0
),
daily_aggregation AS (
  -- Aggregate to daily buckets with category/source breakdown
  -- Separate assets (positive values) from debt (negative values)
  -- to compute accurate net category values
  SELECT
    bucket_date,
    source_type,
    category,
    -- Assets: sum of positive token values
    SUM(CASE WHEN token_value > 0 THEN token_value ELSE 0 END) AS category_assets_usd,
    -- Debt: sum of absolute value of negative token values
    SUM(CASE WHEN token_value < 0 THEN ABS(token_value) ELSE 0 END) AS category_debt_usd,
    -- Net value: assets minus debt (can be negative if debt > assets in a category)
    SUM(token_value) AS category_value_usd
  FROM all_tokens
  GROUP BY bucket_date, source_type, category
),

-- ============================================================================
-- SECTION 5: DAILY TOTALS AND P&L CALCULATION
-- ============================================================================
-- Purpose: Calculate daily totals once and compute P&L with window functions
-- ============================================================================

daily_totals AS (
  -- OPTIMIZATION: Calculate daily total portfolio value ONCE per date
  -- Previous implementation computed this N times per date (once for each category/source row)
  -- This CTE computes it once and joins it back, eliminating redundant calculations
  SELECT
    bucket_date,
    SUM(category_value_usd) AS total_value_usd
  FROM daily_aggregation
  GROUP BY bucket_date
),
with_window_metrics AS (
  -- Compute window functions for P&L calculation
  -- Daily totals are now joined from daily_totals CTE instead of window function
  SELECT
    da.bucket_date,
    da.source_type,
    da.category,
    da.category_value_usd,
    da.category_assets_usd,
    da.category_debt_usd,

    -- Previous day's value for this category/source (for P&L)
    LAG(da.category_value_usd) OVER (
      PARTITION BY da.source_type, da.category
      ORDER BY da.bucket_date
    ) AS prev_value_usd,

    -- Join daily total instead of window function calculation
    -- This eliminates redundant SUM() OVER (PARTITION BY bucket_date) computation
    COALESCE(GREATEST(dt.total_value_usd, 0), 0) AS total_value_usd

  FROM daily_aggregation da
  JOIN daily_totals dt ON da.bucket_date = dt.bucket_date
)

-- ============================================================================
-- FINAL PROJECTION
-- ============================================================================

SELECT
  bucket_date AS date,
  source_type,
  category,
  category_value_usd,
  category_assets_usd,
  category_debt_usd,

  -- Daily P&L: change from previous day for this category/source
  -- COALESCE handles first day (no previous value) as zero P&L
  COALESCE(category_value_usd - prev_value_usd, 0) AS pnl_usd,

  -- Total portfolio NET value (same for all rows on a given date)
  -- Matches landing_page endpoint's net_portfolio_value calculation
  total_value_usd

FROM with_window_metrics
ORDER BY date ASC, category ASC, source_type ASC;

-- ============================================================================
-- USAGE NOTES
-- ============================================================================
--
-- Understanding Output Columns:
--
-- date: The calendar day for the aggregation
-- source_type: 'defi' for protocol positions, 'wallet' for idle tokens
-- category: Token category (btc, eth, stablecoins, others)
-- category_value_usd: NET USD value in this category/source (assets - debt)
-- category_assets_usd: Total positive token values (deposits, holdings)
-- category_debt_usd: Total negative token values as absolute value (borrowings)
-- pnl_usd: Change in NET USD value from previous day for this category/source
--          (0 on first day since no previous day exists)
-- total_value_usd: Sum of category_value_usd across all entries for this day
--                  (NET portfolio value = total assets - total debt)
--                  (same value repeated for all rows on a given date)
--
-- Debt Handling:
--   - Negative token amounts (borrowings) are properly included in calculations
--   - category_value_usd = category_assets_usd - category_debt_usd
--   - total_value_usd matches landing_page endpoint's net_portfolio_value
--   - This ensures historical trends accurately reflect leverage and debt
--
-- Common Analysis Patterns:
--
-- 1. Total Portfolio NET Value Over Time:
--    SELECT DISTINCT date, total_value_usd FROM results ORDER BY date
--
-- 2. Category Performance:
--    SELECT category, SUM(pnl_usd) AS total_pnl
--    FROM results GROUP BY category ORDER BY total_pnl DESC
--
-- 3. DeFi vs Wallet Distribution:
--    SELECT date, source_type, SUM(category_value_usd) AS source_net_value
--    FROM results GROUP BY date, source_type ORDER BY date, source_net_value DESC
--
-- 4. Category Breakdown by Day (with debt):
--    SELECT date, category,
--           SUM(category_assets_usd) AS total_assets,
--           SUM(category_debt_usd) AS total_debt,
--           SUM(category_value_usd) AS net_value
--    FROM results GROUP BY date, category ORDER BY date, net_value DESC
--
-- 5. Leverage Analysis:
--    SELECT date,
--           SUM(category_assets_usd) AS total_assets,
--           SUM(category_debt_usd) AS total_debt,
--           SUM(category_value_usd) AS net_value,
--           CASE WHEN SUM(category_value_usd) > 0
--                THEN SUM(category_assets_usd) / SUM(category_value_usd)
--                ELSE NULL END AS leverage_ratio
--    FROM results GROUP BY date ORDER BY date
--
-- ============================================================================
