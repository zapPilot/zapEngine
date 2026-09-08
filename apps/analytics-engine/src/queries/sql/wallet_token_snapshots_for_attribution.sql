-- Daily idle wallet token balances for net-worth change attribution.
--
-- The DeBank yield snapshots only cover tracked DeFi positions, so a price move
-- on an idle wallet token would otherwise land in the unexplained residual.
-- This query supplies the missing side from analytics.daily_wallet_tokens.
--
-- Parameters:
--   :user_id (UUID) - User identifier
--   :wallet_address (TEXT, optional) - Specific wallet to filter by (NULL = all user wallets)
--   :start_date (TIMESTAMP) - Analysis start date (inclusive)
--   :end_date (TIMESTAMP) - Analysis end date (inclusive)
--
-- end_date is compared inclusively on purpose: it is "now" as a timestamp while
-- snapshot_date is a calendar date, so an exclusive bound would drop today.

WITH user_wallets AS (
    SELECT DISTINCT LOWER(wallet) AS wallet
    FROM user_crypto_wallets
    WHERE user_id = :user_id
      AND (
        CAST(:wallet_address AS TEXT) IS NULL
        OR LOWER(wallet) = LOWER(CAST(:wallet_address AS TEXT))
      )
)
SELECT
    LOWER(t.user_wallet_address) AS wallet,
    t.chain,
    t.token_address,
    t.symbol,
    t.amount,
    t.price,
    t.snapshot_date
FROM analytics.daily_wallet_tokens t
JOIN user_wallets uw ON LOWER(t.user_wallet_address) = uw.wallet
WHERE t.snapshot_date >= CAST(:start_date AS DATE)
  AND t.snapshot_date <= CAST(:end_date AS DATE)
ORDER BY t.snapshot_date;
