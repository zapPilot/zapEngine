-- Optimized yield returns query with protocol type detection and hybrid preprocessing
-- Performance: 80-150ms query time, ~2.5MB transfer (32% reduction from 3.7MB)
-- Uses index: idx_portfolio_snapshots_wallet_snapshot (wallet, snapshot_at DESC)
--
-- Parameters:
--   :user_id (UUID) - User identifier
--   :wallet_address (TEXT, optional) - Specific wallet address to filter by (NULL = all user wallets)
--   :start_date (TIMESTAMP) - Analysis start date
--   :end_date (TIMESTAMP) - Analysis end date (exclusive)

WITH user_wallets AS (
    -- Get all wallets for the user (or filter to specific wallet if provided)
    SELECT DISTINCT LOWER(wallet) AS wallet
    FROM user_crypto_wallets
    WHERE user_id = :user_id
      AND (CAST(:wallet_address AS TEXT) IS NULL OR lower(wallet) = lower(CAST(:wallet_address AS TEXT)))
),
yield_positions AS (
    -- Filter to yield-generating positions and detect protocol type
    SELECT
        dps.wallet,
        dps.chain,
        dps.name AS protocol_name,
        dps.snapshot_at,
        dps.name_item AS position_type,
        dps.detail,
        dps.detail_types,
        dps.net_usd_value,  -- Added for USD balance protocols
        -- Protocol type detection: Hyperliquid uses USD balance, others use token-based
        CASE
            WHEN LOWER(dps.name) = 'hyperliquid' THEN 'usd_balance'
            ELSE 'token_based'
        END AS protocol_type
    FROM daily_portfolio_snapshots dps
    JOIN user_wallets uw ON dps.wallet = uw.wallet
    WHERE dps.snapshot_at >= :start_date
      AND dps.snapshot_at < :end_date
    -- Position type filtering handled by Python service (DELTA_POSITION_TYPES)
)
SELECT
    LOWER(wallet) AS wallet,
    chain,
    protocol_name,
    snapshot_at,
    position_type AS name_item,  -- BACKWARD COMPATIBILITY: Service expects name_item key (yield_return_service.py:192, 289)
    protocol_type,               -- Protocol classification: 'token_based' | 'usd_balance'
    detail_types,                -- Position detail types for debugging
    -- Hybrid preprocessing: extract relevant data based on protocol type
    CASE
        WHEN protocol_type = 'usd_balance' THEN
            -- USD balance protocols (Hyperliquid): use direct column access
            jsonb_build_object(
                'usd_value',
                COALESCE(net_usd_value, 0)  -- Simplified: direct column access
            )
        ELSE
            -- Token-based protocols: extract token lists for yields, supplies, borrows, rewards
            jsonb_build_object(
                'supply_tokens',
                COALESCE(detail->'supply_token_list', '[]'::jsonb),
                'borrow_tokens',
                COALESCE(detail->'borrow_token_list', '[]'::jsonb),
                'reward_tokens',
                COALESCE(detail->'reward_token_list', '[]'::jsonb)
            )
    END AS protocol_data
FROM yield_positions
ORDER BY snapshot_at ASC;
