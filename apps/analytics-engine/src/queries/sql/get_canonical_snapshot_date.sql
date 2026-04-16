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
--   2. Find dates where snapshots exist for those wallets
--   3. Return the most recent date with ANY snapshot data
--
-- Performance:
--   - Uses daily_portfolio_snapshots MV (already deduped)
--   - Index on (wallet, snapshot_date) provides fast lookups
--   - Typical latency: 5-15ms
--
-- Usage:
--   All services should call this FIRST to get the canonical snapshot_date
--   before querying portfolio data, ensuring consistency across all metrics.
-- ============================================================================

WITH user_wallets AS (
  -- Get user's wallet addresses (optionally filtered)
  SELECT DISTINCT LOWER(wallet) AS wallet
  FROM user_crypto_wallets
  WHERE user_id = :user_id
    AND (CAST(:wallet_address AS TEXT) IS NULL
         OR lower(wallet) = lower(CAST(:wallet_address AS TEXT)))
),
latest_snapshots AS (
  -- Get latest snapshot per wallet per date
  SELECT
    dps.wallet,
    (dps.snapshot_at AT TIME ZONE 'UTC')::date AS snapshot_date,
    MAX(dps.snapshot_at) AS latest_snapshot_at
  FROM daily_portfolio_snapshots dps
  JOIN user_wallets uw ON dps.wallet = uw.wallet
  GROUP BY dps.wallet, (dps.snapshot_at AT TIME ZONE 'UTC')::date
),
date_rollup AS (
  -- Roll up snapshot coverage by date
  SELECT
    snapshot_date,
    COUNT(DISTINCT wallet) AS wallet_count,
    MAX(latest_snapshot_at) AS max_snapshot_at
  FROM latest_snapshots
  GROUP BY snapshot_date
)
SELECT
  snapshot_date,
  wallet_count,
  max_snapshot_at
FROM date_rollup
ORDER BY snapshot_date DESC
LIMIT 1;

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
