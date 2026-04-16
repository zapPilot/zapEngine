-- Get user's portfolio history span (earliest to latest snapshot date)
-- Counts ACTUAL days with snapshot data, not just calendar span.
--
-- Parameters:
--   :user_id - UUID of the user
--
-- Returns:
--   earliest_date: First day with portfolio data
--   latest_date: Most recent day with portfolio data
--   total_days: Number of days with actual snapshot data (not calendar span)
--
WITH user_wallets AS (
  SELECT DISTINCT LOWER(wallet) AS wallet
  FROM user_crypto_wallets
  WHERE user_id = :user_id
),
snapshot_stats AS (
  SELECT
    MIN((dps.snapshot_at AT TIME ZONE 'UTC')::date) AS earliest_date,
    MAX((dps.snapshot_at AT TIME ZONE 'UTC')::date) AS latest_date,
    COUNT(DISTINCT (dps.snapshot_at AT TIME ZONE 'UTC')::date) AS total_days
  FROM daily_portfolio_snapshots dps
  JOIN user_wallets uw ON dps.wallet = uw.wallet
)
SELECT
  earliest_date,
  latest_date,
  COALESCE(total_days, 0) AS total_days
FROM snapshot_stats;
