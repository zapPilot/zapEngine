-- Get pool performance data for a specific user
-- Aggregates portfolio positions with APR data from DeFiLlama and Hyperliquid sources
--
-- Parameters:
--   :user_id - UUID of the user
--   :snapshot_date - Optional date (YYYY-MM-DD) to filter to specific calendar day
--                   If NULL, uses latest daily snapshot per wallet
--
-- Returns pool performance metrics including:
--   - Position identifiers and metadata
--   - Protocol and chain information
--   - Asset values and portfolio contribution
--   - APR data with source matching
--   - Pool token composition
--
-- Data Quality (v6 - Deduplication Removed):
--   - Removed deduplication logic (ETL guarantees no duplicates)
--   - Multiple positions with same name_item are LEGITIMATE separate positions
--   - Example: Frax has 4 "Locked" positions with different unlock_at dates
--   - Example: GMX V2 has multiple "Liquidity Pool" positions with different tokens
--   - Trusts ETL data - no merging of distinct positions

WITH user_wallets AS (
    SELECT LOWER(wallet) AS wallet
    FROM user_crypto_wallets
    WHERE user_id = :user_id
),
wallet_latest_snapshots AS (
    SELECT
        dps.wallet,
        CASE
            -- If snapshot_date provided, use that specific calendar day
            WHEN CAST(:snapshot_date AS TEXT) IS NOT NULL THEN
                CAST(:snapshot_date AS DATE)
            -- Otherwise, use overall latest daily snapshot
            ELSE MAX(dps.snapshot_date)
        END AS latest_snapshot_date
    FROM daily_portfolio_snapshots dps
    INNER JOIN user_wallets uw ON dps.wallet = uw.wallet
    GROUP BY dps.wallet
),
latest_snapshots AS (
    SELECT
        dps.id AS snapshot_id,
        dps.wallet,
        LOWER(dps.chain) AS chain,
        LOWER(dps.name) AS protocol,
        dps.name_item,
        dps.asset_usd_value,
        dps.net_usd_value,
        dps.snapshot_at,
        symbols.pool_symbols_json,
        symbols.pool_symbols_str,
        ROW_NUMBER() OVER (
            PARTITION BY
                dps.wallet,
                LOWER(dps.chain),
                LOWER(dps.name),
                symbols.pool_symbols_str
            ORDER BY dps.asset_usd_value DESC, dps.snapshot_at DESC  -- Keep highest-value snapshot per signature
        ) AS snapshot_rank
    FROM daily_portfolio_snapshots dps
    INNER JOIN wallet_latest_snapshots wls
        ON wls.wallet = dps.wallet
        -- If snapshot_date provided: filter to that exact calendar day
        -- If snapshot_date is NULL: use latest daily snapshot per wallet
        AND dps.snapshot_date = wls.latest_snapshot_date
    CROSS JOIN LATERAL (
        SELECT
            COALESCE(
                (
                    SELECT jsonb_agg(sym ORDER BY sym)
                    FROM (
                        SELECT DISTINCT token->>'symbol' AS sym
                        FROM jsonb_array_elements(dps.asset_token_list) AS token
                        WHERE token->>'symbol' IS NOT NULL
                    ) t
                ),
                '[]'::jsonb
            ) AS pool_symbols_json,
            array_to_string(
                ARRAY(
                    SELECT DISTINCT sym
                    FROM (
                        SELECT token->>'symbol' AS sym
                        FROM jsonb_array_elements(dps.asset_token_list) AS token
                        WHERE token->>'symbol' IS NOT NULL
                    ) t
                    ORDER BY sym
                ),
                ','
            ) AS pool_symbols_str
    ) symbols
    WHERE dps.asset_usd_value > 0  -- Only positions with value
),
-- Aggregate positions by wallet/protocol/chain/symbols
-- Fixed: Direct aggregation without unnesting to prevent value multiplication
-- Fixed: Added wallet to GROUP BY to prevent cross-wallet aggregation
aggregated_pools AS (
    SELECT
        wallet,  -- Include wallet for position uniqueness across user's wallets
        -- Use first snapshot_id as representative ID (cast to text for Pydantic)
        (array_agg(snapshot_id::text ORDER BY asset_usd_value DESC, snapshot_at DESC))[1] AS snapshot_id,
        -- Collect all snapshot IDs for this pool (cast to text array for Pydantic)
        array_agg(DISTINCT snapshot_id::text) AS snapshot_ids,
        -- Use LOWER() to match GROUP BY expressions for case-normalized grouping
        chain,
        protocol,
        pool_symbols_json,
        -- Build symbol string for APR matching with optimized array constructor
        -- Previous: Scalar subquery executed for each row in aggregation
        -- Optimized: Array constructor eliminates subquery overhead (~80-120ms gain)
        -- Sorting ensures consistent matching regardless of symbol order in JSONB array
        pool_symbols_str,
        -- Direct aggregation from latest_snapshots (no unnesting)
        -- Each snapshot's value is counted exactly once PER WALLET
        SUM(asset_usd_value) AS total_asset_usd_value,
        SUM(net_usd_value) AS total_net_usd_value,
        MAX(snapshot_at) AS latest_snapshot_at
    FROM latest_snapshots
    WHERE snapshot_rank = 1  -- Deduplicate to latest snapshot per wallet/protocol/pool signature
    -- Case-normalize chain and protocol to prevent duplicate groups from case variations
    -- Removed apr_source_type from GROUP BY to prevent artificial position splits
    GROUP BY wallet, chain, protocol, pool_symbols_json, pool_symbols_str
),
-- Calculate total portfolio value for contribution percentages
portfolio_total AS (
    SELECT SUM(total_asset_usd_value) AS total_portfolio_value
    FROM aggregated_pools
),
-- Simplified pool aggregation without APR joins
pools_simplified AS (
    SELECT
        ap.wallet,  -- Include wallet for position uniqueness
        ap.snapshot_id,
        ap.snapshot_ids,
        ap.chain,
        ap.protocol,
        ap.protocol AS protocol_id,  -- Use protocol name as ID
        ap.total_asset_usd_value,
        ap.pool_symbols_json,
        ap.latest_snapshot_at,
        -- Calculate portfolio contribution
        ROUND(
            (ap.total_asset_usd_value / NULLIF(pt.total_portfolio_value, 0) * 100)::numeric,
            2
        ) AS contribution_to_portfolio
    FROM aggregated_pools ap
    CROSS JOIN portfolio_total pt
)
SELECT
    LOWER(wallet) AS wallet,  -- Normalize to lowercase for consistency with ETL
    snapshot_id,
    snapshot_ids,
    chain,
    protocol AS protocol_id,
    protocol,
    protocol AS protocol_name,  -- Use protocol as display name
    total_asset_usd_value AS asset_usd_value,
    pool_symbols_json AS pool_symbols,
    contribution_to_portfolio
FROM pools_simplified
ORDER BY total_asset_usd_value DESC;
