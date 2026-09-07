-- ============================================================================
-- GET CANONICAL SNAPSHOT DATE
-- ============================================================================
-- Returns the latest snapshot date with available data for a user (optionally filtered by wallet).
--
-- Purpose:
--   Single source of truth for snapshot date selection across all analytics services.
--   Ensures all endpoints (landing, dashboard, trends, etc.) use the same "as-of" date.
--
-- Parameters:
--   :user_id (UUID) - User identifier
--   :wallet_address (TEXT, optional) - Specific wallet filter (NULL = all user wallets)
--
-- Returns:
--   - snapshot_date: Latest date with available data (UTC)
--   - wallet_count: Number of wallets with snapshots on this date
--   - max_snapshot_at: Latest snapshot timestamp for this date
--
-- Logic:
--   1. Get user's wallet addresses (optionally filtered by wallet_address)
--   2. Find the newest date any of those wallets has data for
--   3. Roll that single date up into coverage and freshness figures
--
-- Performance:
--   daily_portfolio_snapshots is a plain view over analytics.daily_portfolio_positions,
--   so only the base table's indexes exist. The stored snapshot_date column is used
--   rather than a computed (snapshot_at AT TIME ZONE 'UTC')::date, because a btree on
--   (wallet, snapshot_date) cannot order or bound a computed expression -- deriving the
--   day made this read every historical row for every wallet in the bundle. The two
--   agree by construction: alpha-etl writes snapshot_date as the UTC calendar day of
--   snapshot_at (apps/alpha-etl/src/modules/wallet/portfolioWriter.ts).
--
-- Usage:
--   All services should call this FIRST to get the canonical snapshot_date
--   before querying portfolio data, ensuring consistency across all metrics.
-- ============================================================================

WITH user_wallets AS (
  -- Registration keeps whatever casing the user typed; the ETL lower-cases every
  -- address it writes, so only this side needs folding.
  SELECT DISTINCT LOWER(wallet) AS wallet
  FROM user_crypto_wallets
  WHERE user_id = :user_id
    AND (CAST(:wallet_address AS TEXT) IS NULL
         OR lower(wallet) = lower(CAST(:wallet_address AS TEXT)))
),
canonical_day AS (
  -- Only the newest day can win, so probe the index backwards once per wallet
  -- instead of grouping the wallet's entire history.
  SELECT MAX(latest.snapshot_date) AS snapshot_date
  FROM user_wallets uw
  CROSS JOIN LATERAL (
    SELECT dps.snapshot_date
    FROM daily_portfolio_snapshots dps
    WHERE dps.wallet = uw.wallet
    ORDER BY dps.snapshot_date DESC
    LIMIT 1
  ) latest
)
SELECT
  cd.snapshot_date,
  COUNT(DISTINCT dps.wallet) AS wallet_count,
  MAX(dps.snapshot_at) AS max_snapshot_at
FROM canonical_day cd
CROSS JOIN user_wallets uw
JOIN daily_portfolio_snapshots dps
  ON dps.wallet = uw.wallet
 AND dps.snapshot_date = cd.snapshot_date
GROUP BY cd.snapshot_date;

-- ============================================================================
-- USAGE NOTES
-- ============================================================================
--
-- Example 1: Get latest snapshot date for all user wallets (bundle)
--   SELECT * FROM get_canonical_snapshot_date WHERE user_id = '<uuid>' AND wallet_address IS NULL;
--
-- Example 2: Get latest snapshot date for specific wallet
--   SELECT * FROM get_canonical_snapshot_date WHERE user_id = '<uuid>' AND wallet_address = '0x...';
--
-- Consistency Guarantee:
--   When wallet_address IS NULL, returns the latest date where ANY wallet has data.
--   This avoids returning zero when a bundle contains wallets with no snapshots.
--
-- Error Cases:
--   - Returns no rows if user has no snapshots
--   - Returns no rows if user doesn't exist
--   - Returns no rows if wallet_address doesn't match any user wallets
--
-- Integration:
--   All analytics services should use this query via CanonicalSnapshotService
--   to ensure consistent snapshot dates across all endpoints.
-- ============================================================================
