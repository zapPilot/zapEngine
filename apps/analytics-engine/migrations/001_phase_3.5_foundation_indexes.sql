-- ============================================================================
-- Phase 3.5: Foundation Indexes for SQL Performance Optimization
-- ============================================================================
-- Created: 2025-11-16
-- Updated: 2025-11-16 (Schema-accurate version)
-- Purpose: Create optimized indexes for portfolio analytics queries
--
-- SCHEMA NOTE: portfolio_item_snapshots does NOT have user_id column.
-- User lookups require JOIN to user_crypto_wallets(wallet).
--
-- These indexes provide:
-- 1. Index-only scans with INCLUDE clause (eliminates heap I/O)
-- 2. JSONB GIN indexes for fast token operations
-- 3. Case-insensitive protocol name matching with trigram indexes
-- 4. Cleanup of redundant indexes
--
-- Expected Performance Impact:
-- - Wallet-based covering index: -0.3-0.5s per query (5+ queries)
-- - JSONB GIN index: -0.2s per query (4+ queries)
-- - Trigram indexes: -0.3s per query (2 queries)
-- - Total Estimated Savings: ~0.8-1.0 seconds across critical paths
--
-- Migration Strategy:
-- - All indexes created with CONCURRENTLY (no table locks)
-- - Estimated total build time: 60-90 minutes
-- - No downtime required
-- - Removes 2 redundant single-column wallet indexes
-- ============================================================================

-- ============================================================================
-- Index 1: Wallet-Based Date Range Index with INCLUDE Clause
-- ============================================================================
-- Purpose: Enable index-only scans for wallet portfolio queries
-- Impact: -0.3-0.5s per query affecting 5+ queries
-- Affected Queries:
--   - get_portfolio_category_trend_by_user_id.sql
--   - get_portfolio_daily_returns.sql
--   - get_unified_drawdown_analysis.sql
--   - get_landing_page_portfolio_summary.sql (DEPRECATED - replaced by PortfolioSnapshotService)
--   - portfolio_snapshots_for_yield_returns.sql
--
-- Storage Cost: ~300-500 MB (15-25% larger than basic index)
-- Build Time: ~15-30 minutes
-- ============================================================================

-- Create new wallet-based index with INCLUDE clause for covering queries
-- INCLUDE columns eliminate heap fetches for common query patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_portfolio_snapshots_wallet_snapshot_v2
ON portfolio_item_snapshots (wallet, snapshot_at DESC)
INCLUDE (
    net_usd_value,      -- Used in daily returns, drawdown analysis
    asset_usd_value,    -- Used in portfolio value calculations
    asset_token_list,   -- Used in category trend analysis, token operations
    chain,              -- Used in protocol aggregation
    name                -- Protocol name for filtering
);
-- ============================================================================
-- Index 2: JSONB GIN Index for asset_token_list Operations
-- ============================================================================
-- Purpose: Optimize JSONB array operations on asset_token_list
-- Impact: -0.2s per query affecting 4+ queries
-- Affected Queries:
--   - get_landing_page_portfolio_summary.sql (DEPRECATED - replaced by PortfolioSnapshotService)
--   - get_portfolio_category_trend_by_user_id.sql (LATERAL join)
--   - get_pool_performance_by_user.sql (JSONB aggregation)
--   - get_wallet_token_categories.sql (token filtering)
--
-- Storage Cost: ~200-400 MB
-- Build Time: ~20-40 minutes
-- ============================================================================

-- Create GIN index with jsonb_path_ops operator class
-- jsonb_path_ops is optimized for @> (containment) operations and general JSONB access
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_portfolio_snapshots_asset_tokens_gin
ON portfolio_item_snapshots USING GIN (asset_token_list jsonb_path_ops)
WHERE asset_token_list IS NOT NULL;

-- ============================================================================
-- Index 3: GIN Trigram Index for Protocol Name Matching
-- ============================================================================
-- Purpose: Fast case-insensitive protocol name matching
-- Impact: -0.5s per query affecting 2 queries
-- Affected Queries:
--   - get_pool_performance_by_user.sql (protocol matching on lines 166, 170)
--   - portfolio_snapshots_for_yield_returns.sql (protocol type detection)
--
-- Storage Cost: ~50-100 MB
-- Build Time: ~10-20 minutes
-- ============================================================================

-- Enable pg_trgm extension (if not already enabled)
-- Note: Requires superuser or rds_superuser role
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram index for case-insensitive protocol name matching on portfolio snapshots
-- Supports queries like: WHERE LOWER(name) = 'hyperliquid'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_portfolio_snapshots_protocol_trgm
ON portfolio_item_snapshots USING GIN (LOWER(name) gin_trgm_ops);

-- ============================================================================
-- Index 3: GIN Trigram Index for DeFiLlama Pool Protocol Matching
-- ============================================================================
-- Purpose: Fast protocol matching for APR data joins
-- Impact: Eliminates full table scans in APR matching queries
--
-- Storage Cost: ~10-20 MB
-- Build Time: ~5-10 minutes
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pool_apr_protocol_trgm
ON alpha_raw.pool_apr_snapshots USING GIN (LOWER(protocol) gin_trgm_ops);

-- ============================================================================
-- Index 4: GIN Trigram Index for Hyperliquid Vault Name Matching
-- ============================================================================
-- Purpose: Fast vault name matching for Hyperliquid APR data
-- Impact: Optimizes Hyperliquid-specific protocol matching
--
-- Storage Cost: ~5-10 MB (small table)
-- Build Time: ~2-5 minutes
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hyperliquid_vault_name_trgm
ON alpha_raw.hyperliquid_vault_apr_snapshots USING GIN (LOWER(vault_name) gin_trgm_ops);

-- ============================================================================
-- Index Cleanup: Remove Redundant Indexes
-- ============================================================================
-- Purpose: Remove duplicate single-column wallet indexes
-- These are superseded by composite idx_portfolio_snapshots_wallet_snapshot_v2
-- and existing idx_portfolio_snapshots_wallet_snapshot
--
-- Storage Savings: ~100-200 MB
-- ============================================================================

-- Drop redundant wallet index #1 (covered by composite indexes)
DROP INDEX CONCURRENTLY IF EXISTS idx_portfolio_snapshots_wallet;

-- Drop redundant wallet index #2 (covered by composite indexes)
DROP INDEX CONCURRENTLY IF EXISTS idx_snapshot_wallet;

-- ============================================================================
-- Validation Queries
-- ============================================================================
-- Run these after index creation to verify usage and performance gains
-- ============================================================================

-- Verify index-only scan on portfolio snapshots (wallet-based)
-- Expected: "Index Only Scan using idx_portfolio_snapshots_wallet_snapshot_v2"
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT wallet, snapshot_at, net_usd_value, asset_usd_value
-- FROM portfolio_item_snapshots
-- WHERE wallet = '0x5f57c8a32bC5777a206415155755Afa73580C0e4'
--   AND snapshot_at >= NOW() - INTERVAL '30 days'
-- ORDER BY snapshot_at DESC;

-- Verify JSONB GIN index for token operations
-- Expected: "Bitmap Index Scan using idx_portfolio_snapshots_asset_tokens_gin"
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT COUNT(*)
-- FROM portfolio_item_snapshots
-- WHERE asset_token_list @> '[{"symbol": "USDC"}]'::jsonb;

-- Verify trigram index on protocol name
-- Expected: "Bitmap Index Scan using idx_portfolio_snapshots_protocol_trgm"
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT COUNT(*)
-- FROM portfolio_item_snapshots
-- WHERE LOWER(name) = 'hyperliquid';

-- Verify trigram index on pool APR protocol
-- Expected: "Bitmap Index Scan using idx_pool_apr_protocol_trgm"
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT COUNT(*)
-- FROM alpha_raw.pool_apr_snapshots
-- WHERE LOWER(protocol) = 'aave-v3';

-- Verify trigram index on Hyperliquid vault name
-- Expected: "Bitmap Index Scan using idx_hyperliquid_vault_name_trgm"
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT COUNT(*)
-- FROM alpha_raw.hyperliquid_vault_apr_snapshots
-- WHERE LOWER(vault_name) LIKE '%usdc%';

-- ============================================================================
-- Monitoring Queries
-- ============================================================================
-- Track index usage and performance after deployment
-- ============================================================================

-- Monitor index usage statistics
-- SELECT
--     schemaname,
--     tablename,
--     indexname,
--     idx_scan AS scans,
--     idx_tup_read AS tuples_read,
--     idx_tup_fetch AS tuples_fetched,
--     pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
-- FROM pg_stat_user_indexes
-- WHERE indexname IN (
--     'idx_portfolio_snapshots_wallet_snapshot_v2',
--     'idx_portfolio_snapshots_asset_tokens_gin',
--     'idx_portfolio_snapshots_protocol_trgm',
--     'idx_pool_apr_protocol_trgm',
--     'idx_hyperliquid_vault_name_trgm'
-- )
-- ORDER BY idx_scan DESC;

-- Monitor index bloat (run periodically)
-- SELECT
--     schemaname,
--     tablename,
--     indexname,
--     pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
--     idx_scan,
--     idx_tup_read,
--     idx_tup_fetch,
--     CASE
--         WHEN idx_scan = 0 THEN 'UNUSED'
--         WHEN idx_scan < 100 THEN 'LOW_USAGE'
--         ELSE 'ACTIVE'
--     END AS usage_status
-- FROM pg_stat_user_indexes
-- WHERE indexname LIKE '%_v2' OR indexname LIKE '%_trgm' OR indexname LIKE '%_gin'
-- ORDER BY pg_relation_size(indexrelid) DESC;

-- ============================================================================
-- Rollback Plan
-- ============================================================================
-- If indexes cause issues, drop them with CONCURRENTLY
-- ============================================================================

-- DROP INDEX CONCURRENTLY IF EXISTS idx_portfolio_snapshots_wallet_snapshot_v2;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_portfolio_snapshots_asset_tokens_gin;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_portfolio_snapshots_protocol_trgm;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_pool_apr_protocol_trgm;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_hyperliquid_vault_name_trgm;

-- Recreate removed indexes if needed
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_portfolio_snapshots_wallet ON portfolio_item_snapshots (wallet);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_snapshot_wallet ON portfolio_item_snapshots (wallet);

-- ============================================================================
-- Notes
-- ============================================================================
-- 1. portfolio_item_snapshots table uses wallet column, NOT user_id
--    User lookups require JOIN to user_crypto_wallets(user_id, wallet)
--
-- 2. pg_trgm extension must be enabled before creating trigram indexes
--    (requires superuser or rds_superuser role)
--
-- 3. CONCURRENTLY creates indexes without blocking writes, but takes longer
--    and requires more disk space (temporary)
--
-- 4. Monitor pg_stat_activity during index builds to track progress
--
-- 5. After 24-48 hours of monitoring, old idx_portfolio_snapshots_wallet_snapshot
--    can be dropped if _v2 version is performing well
--
-- 6. Token categorization uses classify_token_category() UDF - no lookup table needed
--    Function is IMMUTABLE and handles new tokens automatically via pattern matching
-- ============================================================================
