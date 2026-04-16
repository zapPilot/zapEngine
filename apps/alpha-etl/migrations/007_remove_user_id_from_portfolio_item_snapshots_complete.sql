-- Migration 007: Remove user_id from portfolio_item_snapshots (Complete)
-- Reason: Wallet data should be tied to wallet address, not user_id
-- Same wallet can appear multiple times when users have multiple VIP subscriptions
-- This prevents duplicate key violations in the Hyperliquid ETL pipeline
--
-- This migration handles:
-- 1. Drops dependent materialized views
-- 2. Removes user_id column from portfolio_item_snapshots
-- 3. Adds correct unique constraint for DeBank data structure
-- 4. Recreates materialized views with JOIN to user_crypto_wallets
-- 5. Recreates all indexes
--
-- Note: DeBank returns multiple portfolio items per protocol (e.g., multiple staking positions).
-- The unique constraint uses (wallet, id_raw, snapshot_at, name_item, net_usd_value)
-- to preserve all distinct positions while preventing true duplicates.

BEGIN;

-- ============================================================================
-- STEP 1: Drop dependent materialized views (with CASCADE for indexes)
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS public.mv_current_portfolio_unified CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.mv_portfolio_summary_v2 CASCADE;

-- ============================================================================
-- STEP 2: Drop all indexes that reference user_id column on base table
-- ============================================================================

DROP INDEX IF EXISTS public.idx_portfolio_snapshots_user_id;
DROP INDEX IF EXISTS public.idx_portfolio_snapshots_user_wallet;
DROP INDEX IF EXISTS public.idx_pis_user_id;
DROP INDEX IF EXISTS public.idx_pis_user_snapshot;
DROP INDEX IF EXISTS public.idx_pis_user_wallet;

-- ============================================================================
-- STEP 3: Drop foreign key constraint
-- ============================================================================

ALTER TABLE public.portfolio_item_snapshots
DROP CONSTRAINT IF EXISTS fk_snapshot_user_wallet;

-- ============================================================================
-- STEP 4: Drop existing unique constraints that include user_id
-- ============================================================================

ALTER TABLE public.portfolio_item_snapshots
DROP CONSTRAINT IF EXISTS portfolio_item_snapshots_daily_unique;

ALTER TABLE public.portfolio_item_snapshots
DROP CONSTRAINT IF EXISTS uidx_pis_daily;

-- ============================================================================
-- STEP 5: Remove user_id column
-- ============================================================================

ALTER TABLE public.portfolio_item_snapshots
DROP COLUMN IF EXISTS user_id;

-- ============================================================================
-- STEP 6: Add new unique constraint
-- ============================================================================

-- Note: Uses 5 columns to uniquely identify each portfolio position:
-- - wallet: User's wallet address
-- - id_raw: Protocol ID (e.g., 'base_aerodrome')
-- - snapshot_at: Timestamp of the snapshot
-- - name_item: Position name (e.g., 'Farming', 'Liquidity Pool')
-- - net_usd_value: Net USD value of the position
--
-- This allows multiple positions per protocol (e.g., multiple staking positions)
-- while preventing true duplicates. Verified: 0 duplicates with this constraint.
ALTER TABLE public.portfolio_item_snapshots
ADD CONSTRAINT portfolio_item_snapshots_unique
UNIQUE (wallet, id_raw, snapshot_at, name_item, net_usd_value);

-- ============================================================================
-- STEP 7: Add performance indexes for common query patterns
-- ============================================================================

-- Index for querying by wallet address (most common lookup)
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_wallet
ON public.portfolio_item_snapshots(wallet);

-- Index for time-series queries (latest snapshots)
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_snapshot_at
ON public.portfolio_item_snapshots(snapshot_at DESC);

-- Composite index for wallet + time queries
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_wallet_snapshot
ON public.portfolio_item_snapshots(wallet, snapshot_at DESC);

-- ============================================================================
-- STEP 8: Recreate mv_current_portfolio_unified with JOIN to user_crypto_wallets
-- ============================================================================

CREATE MATERIALIZED VIEW public.mv_current_portfolio_unified AS
WITH latest_date AS (
    SELECT
        ucw.user_id,
        MAX(pis.snapshot_at::date) AS snapshot_date
    FROM portfolio_item_snapshots pis
    JOIN user_crypto_wallets ucw ON pis.wallet = ucw.wallet
    GROUP BY ucw.user_id
),
latest_items AS (
    SELECT
        pis.id,
        ucw.user_id,
        pis.wallet,
        pis.snapshot_at,
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
    JOIN user_crypto_wallets ucw ON pis.wallet = ucw.wallet
    JOIN latest_date ld ON ucw.user_id = ld.user_id AND pis.snapshot_at::date = ld.snapshot_date
),
portfolio_summary AS (
    SELECT
        user_id,
        SUM(net_usd_value) AS total_value_usd,
        COUNT(DISTINCT wallet) AS wallet_count,
        MAX(snapshot_at) AS last_updated
    FROM latest_items
    GROUP BY user_id
),
extracted_tokens AS (
    SELECT
        i.user_id,
        i.id,
        i.name AS protocol_name,
        i.name_item AS protocol_type,
        LOWER(t.tok->>'symbol') AS symbol,
        LOWER(t.tok->>'name') AS name,
        (t.tok->>'amount')::numeric AS amount,
        (t.tok->>'price')::numeric AS price,
        CASE
            WHEN t.token_type = 'borrow' THEN -1::numeric * (t.tok->>'amount')::numeric * (t.tok->>'price')::numeric
            ELSE (t.tok->>'amount')::numeric * (t.tok->>'price')::numeric
        END AS token_usd_value
    FROM latest_items i
    LEFT JOIN LATERAL (
        SELECT x.value AS tok, 'supply'::text AS token_type
        FROM jsonb_array_elements(COALESCE(i.detail->'supply_token_list', '[]'::jsonb)) x(value)
        UNION ALL
        SELECT x.value, 'reward'::text
        FROM jsonb_array_elements(COALESCE(i.detail->'reward_token_list', '[]'::jsonb)) x(value)
        UNION ALL
        SELECT x.value, 'borrow'::text
        FROM jsonb_array_elements(COALESCE(i.detail->'borrow_token_list', '[]'::jsonb)) x(value)
    ) t ON true
    WHERE (t.tok->>'amount')::numeric <> 0 AND (t.tok->>'price')::numeric <> 0
),
categorized_tokens AS (
    SELECT
        user_id,
        id,
        symbol,
        name,
        amount,
        token_usd_value,
        protocol_name,
        protocol_type,
        CASE
            WHEN symbol LIKE 'btc%' OR symbol LIKE '%btc' OR symbol LIKE '%-%btc%-%' THEN 'btc'
            WHEN symbol LIKE 'eth%' OR symbol LIKE '%eth' OR symbol LIKE '%-%eth%-%' THEN 'eth'
            WHEN symbol ~* '^(usd|usdc|usdt|dai|frax|eurc|ohm|gho|bold)'
                OR symbol ~* '(usd|usdc|usdt|dai|frax|eurc|ohm|gho|bold)$'
                OR symbol LIKE '%-%usd%-%' THEN 'stablecoins'
            ELSE 'others'
        END AS category
    FROM extracted_tokens
    WHERE token_usd_value <> 0
),
category_summary AS (
    SELECT
        user_id,
        jsonb_agg(
            jsonb_build_object(
                'category', category,
                'symbol', symbol,
                'name', name,
                'protocol_name', protocol_name,
                'protocol_type', protocol_type,
                'positions', positions,
                'amount', amount,
                'total_usd_value', total_usd_value
            ) ORDER BY category, total_usd_value DESC
        ) AS category_breakdown
    FROM (
        SELECT
            user_id,
            category,
            symbol,
            name,
            protocol_name,
            protocol_type,
            COUNT(DISTINCT id) AS positions,
            SUM(amount) AS amount,
            ROUND(SUM(token_usd_value), 2) AS total_usd_value
        FROM categorized_tokens
        GROUP BY user_id, category, symbol, name, protocol_name, protocol_type
    ) grouped
    GROUP BY user_id
)
SELECT
    ps.user_id,
    ps.total_value_usd,
    ps.wallet_count,
    ps.last_updated,
    COALESCE(cs.category_breakdown, '[]'::jsonb) AS category_breakdown
FROM portfolio_summary ps
LEFT JOIN category_summary cs ON ps.user_id = cs.user_id;

-- ============================================================================
-- STEP 9: Recreate mv_portfolio_summary_v2 with JOIN to user_crypto_wallets
-- ============================================================================

CREATE MATERIALIZED VIEW public.mv_portfolio_summary_v2 AS
WITH latest_date AS (
    SELECT
        ucw.user_id,
        MAX(pis.snapshot_at::date) AS snapshot_date
    FROM portfolio_item_snapshots pis
    JOIN user_crypto_wallets ucw ON pis.wallet = ucw.wallet
    GROUP BY ucw.user_id
),
latest_items AS (
    SELECT
        pis.id,
        ucw.user_id,
        pis.wallet,
        pis.snapshot_at,
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
    JOIN user_crypto_wallets ucw ON pis.wallet = ucw.wallet
    JOIN latest_date ld ON ucw.user_id = ld.user_id AND pis.snapshot_at::date = ld.snapshot_date
),
extracted_tokens AS (
    SELECT
        i.user_id,
        LOWER(t.tok->>'symbol') AS symbol,
        LOWER(t.tok->>'name') AS name,
        (t.tok->>'amount')::numeric AS amount,
        (t.tok->>'price')::numeric AS price,
        CASE
            WHEN t.token_type = 'borrow' THEN -1::numeric * (t.tok->>'amount')::numeric * (t.tok->>'price')::numeric
            ELSE (t.tok->>'amount')::numeric * (t.tok->>'price')::numeric
        END AS token_usd_value
    FROM latest_items i
    LEFT JOIN LATERAL (
        SELECT x.value AS tok, 'supply'::text AS token_type
        FROM jsonb_array_elements(COALESCE(i.detail->'supply_token_list', '[]'::jsonb)) x(value)
        UNION ALL
        SELECT x.value AS tok, 'reward'::text AS token_type
        FROM jsonb_array_elements(COALESCE(i.detail->'reward_token_list', '[]'::jsonb)) x(value)
        UNION ALL
        SELECT x.value AS tok, 'borrow'::text AS token_type
        FROM jsonb_array_elements(COALESCE(i.detail->'borrow_token_list', '[]'::jsonb)) x(value)
    ) t ON true
    WHERE (t.tok->>'amount')::numeric <> 0 AND (t.tok->>'price')::numeric <> 0
),
categorized_tokens AS (
    SELECT
        user_id,
        symbol,
        name,
        amount,
        token_usd_value,
        CASE
            WHEN symbol LIKE 'btc%' OR symbol LIKE '%btc' OR symbol LIKE '%-%btc%-%' THEN 'btc'
            WHEN symbol LIKE 'eth%' OR symbol LIKE '%eth' OR symbol LIKE '%-%eth%-%' THEN 'eth'
            WHEN symbol ~* '^(usd|usdc|usdt|dai|frax|eurc|ohm|gho|bold)'
                OR symbol ~* '(usd|usdc|usdt|dai|frax|eurc|ohm|gho|bold)$'
                OR symbol LIKE '%-%usd%-%' THEN 'stablecoins'
            ELSE 'others'
        END AS category
    FROM extracted_tokens
    WHERE token_usd_value <> 0
),
portfolio_summary AS (
    SELECT
        user_id,
        COUNT(DISTINCT wallet) AS wallet_count,
        MAX(snapshot_at) AS last_updated
    FROM latest_items
    GROUP BY user_id
),
category_aggregation AS (
    SELECT
        user_id,
        jsonb_build_object(
            'btc', COALESCE(SUM(CASE WHEN category = 'btc' AND token_usd_value > 0 THEN token_usd_value ELSE 0 END), 0),
            'eth', COALESCE(SUM(CASE WHEN category = 'eth' AND token_usd_value > 0 THEN token_usd_value ELSE 0 END), 0),
            'stablecoins', COALESCE(SUM(CASE WHEN category = 'stablecoins' AND token_usd_value > 0 THEN token_usd_value ELSE 0 END), 0),
            'others', COALESCE(SUM(CASE WHEN category = 'others' AND token_usd_value > 0 THEN token_usd_value ELSE 0 END), 0)
        ) AS category_summary_assets,
        jsonb_build_object(
            'btc', COALESCE(SUM(CASE WHEN category = 'btc' AND token_usd_value < 0 THEN ABS(token_usd_value) ELSE 0 END), 0),
            'eth', COALESCE(SUM(CASE WHEN category = 'eth' AND token_usd_value < 0 THEN ABS(token_usd_value) ELSE 0 END), 0),
            'stablecoins', COALESCE(SUM(CASE WHEN category = 'stablecoins' AND token_usd_value < 0 THEN ABS(token_usd_value) ELSE 0 END), 0),
            'others', COALESCE(SUM(CASE WHEN category = 'others' AND token_usd_value < 0 THEN ABS(token_usd_value) ELSE 0 END), 0)
        ) AS category_summary_debt,
        COALESCE(SUM(CASE WHEN token_usd_value > 0 THEN token_usd_value ELSE 0 END), 0) AS total_assets,
        COALESCE(SUM(CASE WHEN token_usd_value < 0 THEN ABS(token_usd_value) ELSE 0 END), 0) AS total_debt
    FROM categorized_tokens
    GROUP BY user_id
)
SELECT
    ps.user_id,
    ps.wallet_count,
    ps.last_updated,
    ca.category_summary_assets,
    ca.category_summary_debt,
    ca.total_assets,
    ca.total_debt,
    ca.total_assets - ca.total_debt AS net_portfolio_value
FROM portfolio_summary ps
LEFT JOIN category_aggregation ca ON ps.user_id = ca.user_id;

-- ============================================================================
-- STEP 10: Recreate indexes on materialized views
-- ============================================================================

-- mv_current_portfolio_unified indexes
CREATE UNIQUE INDEX idx_mv_portfolio_unified_user_id
ON public.mv_current_portfolio_unified(user_id);

-- mv_portfolio_summary_v2 indexes
CREATE UNIQUE INDEX idx_mv_portfolio_summary_v2_user
ON public.mv_portfolio_summary_v2(user_id);

CREATE INDEX idx_mv_portfolio_summary_v2_user_id
ON public.mv_portfolio_summary_v2(user_id);

CREATE INDEX idx_mv_portfolio_summary_v2_assets
ON public.mv_portfolio_summary_v2 USING gin(category_summary_assets);

CREATE INDEX idx_mv_portfolio_summary_v2_debt
ON public.mv_portfolio_summary_v2 USING gin(category_summary_debt);

-- ============================================================================
-- STEP 11: Add table comment explaining the schema change
-- ============================================================================

COMMENT ON TABLE public.portfolio_item_snapshots IS
'Portfolio item snapshots keyed by wallet address. Removed user_id to prevent duplicates when users have multiple VIP subscriptions. Use JOIN to user_crypto_wallets to get user_id. Unique constraint uses (wallet, id_raw, snapshot_at, name_item, net_usd_value) to preserve multiple positions per protocol.';

COMMENT ON MATERIALIZED VIEW public.mv_current_portfolio_unified IS
'Current portfolio unified view. Now JOINs to user_crypto_wallets to get user_id from wallet address.';

COMMENT ON MATERIALIZED VIEW public.mv_portfolio_summary_v2 IS
'Portfolio summary v2. Now JOINs to user_crypto_wallets to get user_id from wallet address.';

COMMIT;

-- ============================================================================
-- Post-Migration Steps:
-- ============================================================================
-- After running this migration, you should:
-- 1. REFRESH the materialized views to populate them with current data:
--    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_current_portfolio_unified;
--    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_portfolio_summary_v2;
--
-- 2. Verify the views return data correctly:
--    SELECT COUNT(*) FROM mv_current_portfolio_unified;
--    SELECT COUNT(*) FROM mv_portfolio_summary_v2;
--
-- 3. Verify the unique constraint:
--    -- Should return 0 duplicate groups
--    SELECT COUNT(*) FROM (
--        SELECT wallet, id_raw, snapshot_at, name_item, net_usd_value
--        FROM portfolio_item_snapshots
--        GROUP BY wallet, id_raw, snapshot_at, name_item, net_usd_value
--        HAVING COUNT(*) > 1
--    ) dup;
