-- Get all borrowing positions for a user (one row per position)
-- Uses daily_portfolio_snapshots MV for consistent daily deduplication
-- Supports canonical snapshot date for multi-wallet consistency
--
-- Parameters:
--   :user_id - UUID of the user
--   :snapshot_date - Optional canonical snapshot date (DATE type, use CAST(:snapshot_date AS DATE))
--                    If NULL, uses the most recent snapshot_date from daily_portfolio_snapshots
--
-- Returns:
--   - protocol_id: Protocol identifier
--   - protocol_name: Human-readable protocol name
--   - chain: Blockchain name
--   - total_collateral_usd: asset_usd_value for this position
--   - total_debt_usd: debt_usd_value for this position
--   - net_value_usd: net_usd_value for this position
--   - protocol_health_rate: health_rate from detail JSONB (nullable)
--   - collateral_tokens: JSONB array of supply tokens (currently empty)
--   - debt_tokens: JSONB array of borrow tokens (currently empty)
--   - last_updated: snapshot timestamp

WITH user_wallets AS (
    -- Get all wallets for this user
    SELECT LOWER(wallet) AS wallet
    FROM user_crypto_wallets
    WHERE CAST(user_id AS TEXT) = CAST(:user_id AS TEXT)
),
latest_snapshot AS (
    -- Get the target snapshot date
    -- If snapshot_date provided: use it (for canonical snapshot consistency)
    -- If NULL: use most recent snapshot_date across all user wallets (MV-backed)
    SELECT
        COALESCE(
            CAST(:snapshot_date AS DATE),
            MAX(dps.snapshot_date)
        ) as target_snapshot_date
    FROM daily_portfolio_snapshots dps
    INNER JOIN user_wallets uw ON dps.wallet = uw.wallet
)
SELECT
    dps.name as protocol_id,
    dps.name as protocol_name,
    dps.chain,
    dps.asset_usd_value as total_collateral_usd,
    dps.debt_usd_value as total_debt_usd,
    dps.net_usd_value as net_value_usd,
    CASE
        WHEN dps.detail ? 'health_rate'
        THEN (dps.detail->>'health_rate')::numeric
        ELSE NULL
    END as protocol_health_rate,
    -- Extract token lists from detail JSONB (with null safety)
    CASE
        WHEN dps.detail ? 'supply_token_list'
        THEN dps.detail->'supply_token_list'
        ELSE '[]'::jsonb
    END as collateral_tokens,
    CASE
        WHEN dps.detail ? 'borrow_token_list'
        THEN dps.detail->'borrow_token_list'
        ELSE '[]'::jsonb
    END as debt_tokens,
    dps.snapshot_at as last_updated
FROM daily_portfolio_snapshots dps
INNER JOIN user_wallets uw ON dps.wallet = uw.wallet
CROSS JOIN latest_snapshot ls
WHERE dps.snapshot_date = ls.target_snapshot_date  -- Date-based filter (canonical or latest)
  AND dps.debt_usd_value > 0  -- Only positions with debt
ORDER BY dps.snapshot_at ASC;
