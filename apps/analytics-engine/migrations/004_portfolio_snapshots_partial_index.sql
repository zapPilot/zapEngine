-- ============================================================================
-- Phase 3.5 Optimization: Portfolio Snapshots Partial Index for Recent Data
-- ============================================================================
-- Created: 2025-11-16
-- Purpose: Force optimal index selection for ROI query date-range scans
--
-- Performance Problem:
-- - ROI query takes 5.3 seconds (after Phase 1: will be 2.5s)
-- - portfolio_item_snapshots scan: 3,422ms (54% of ROI query time)
-- - Scans 17,100 rows → filters to 812 rows (95% waste)
-- - Uses `snapshot_at` index instead of composite `(wallet, snapshot_at)` index
--
-- Root Cause:
-- - Query planner estimates date-first scan is cheaper than wallet-first
-- - Low cardinality on wallet (4 wallets) vs high selectivity on date (31 days)
-- - Existing composite index `idx_portfolio_snapshots_wallet_snapshot` exists
--   but isn't being used due to cost estimation
--
-- Solution:
-- - Create partial index on `(wallet, snapshot_at DESC)` for recent data only
-- - WHERE clause filters to last 90 days (covers all ROI lookback periods)
-- - Smaller index size makes wallet-first scan more attractive to planner
-- - Update statistics to reflect new index availability
--
-- Expected Impact:
-- - ROI query: 2.5s → 1.0s (60% faster after Phase 1)
-- - Landing page total: 5.4s → 1.0s (87% faster total)
-- - Row scans: 17,100 → ~812 (95% reduction)
-- - Combined with Phase 1: 8.2s → 1.0s (87% total improvement)
--
-- Migration Strategy:
-- - CREATE INDEX CONCURRENTLY (no table locks)
-- - Estimated build time: 1-2 minutes (40K rows)
-- - Run ANALYZE to update query planner statistics
-- - Planner should now prefer this partial index over date-only index
-- ============================================================================

-- Create partial index for recent portfolio snapshots (last 90 days)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_portfolio_snapshots_wallet_recent
ON portfolio_item_snapshots (wallet, snapshot_at DESC)
WHERE snapshot_at >= CURRENT_TIMESTAMP - INTERVAL '90 days';

-- Update query planner statistics after index creation
ANALYZE portfolio_item_snapshots;

-- ============================================================================
-- Validation Queries
-- ============================================================================
-- Run these after index creation to verify usage and performance gains
-- ============================================================================

-- Verify index exists and size
-- SELECT
--     indexname,
--     pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
--     idx_scan,
--     idx_tup_read,
--     idx_tup_fetch
-- FROM pg_stat_user_indexes
-- WHERE indexname = 'idx_portfolio_snapshots_wallet_recent';
-- Expected: Index exists with size ~2-5 MB (much smaller than full index)

-- Verify index is being used by ROI query
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT *
-- FROM portfolio_item_snapshots
-- WHERE wallet IN (
--     SELECT wallet
--     FROM user_crypto_wallets
--     WHERE user_id = '5fc63d4e-4e07-47d8-840b-ccd3420d553f'
-- )
--   AND snapshot_at >= CURRENT_TIMESTAMP - INTERVAL '31 days';
-- Expected: "Index Scan using idx_portfolio_snapshots_wallet_recent"
-- Expected execution time: < 50ms (vs 3,422ms before)

-- Compare index sizes and usage
-- SELECT
--     indexname,
--     pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
--     idx_scan,
--     idx_tup_read
-- FROM pg_stat_user_indexes
-- WHERE tablename = 'portfolio_item_snapshots'
--   AND indexname LIKE '%wallet%'
-- ORDER BY pg_relation_size(indexrelid) DESC;
-- Expected: idx_portfolio_snapshots_wallet_recent is much smaller and more frequently used

-- ============================================================================
-- Monitoring Queries
-- ============================================================================
-- Track index usage and performance after deployment
-- ============================================================================

-- Monitor which indexes are being used for portfolio queries
-- SELECT
--     schemaname,
--     tablename,
--     indexname,
--     idx_scan AS scans,
--     idx_tup_read AS tuples_read,
--     idx_tup_fetch AS tuples_fetched,
--     pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
--     CASE
--         WHEN idx_scan = 0 THEN 'UNUSED'
--         WHEN idx_scan < 100 THEN 'LOW_USAGE'
--         ELSE 'ACTIVE'
--     END AS usage_status
-- FROM pg_stat_user_indexes
-- WHERE tablename = 'portfolio_item_snapshots'
-- ORDER BY idx_scan DESC;

-- ============================================================================
-- Maintenance Plan
-- ============================================================================
-- Partial index needs periodic maintenance as data ages
-- ============================================================================

-- Option 1: Recreate index monthly to maintain "recent" constraint
-- This can be done during off-peak hours via cron job
-- DROP INDEX CONCURRENTLY idx_portfolio_snapshots_wallet_recent;
-- CREATE INDEX CONCURRENTLY idx_portfolio_snapshots_wallet_recent
-- ON portfolio_item_snapshots (wallet, snapshot_at DESC)
-- WHERE snapshot_at >= CURRENT_TIMESTAMP - INTERVAL '90 days';

-- Option 2: Use a static date threshold (requires manual updates)
-- WHERE snapshot_at >= '2024-08-01'::timestamp
-- Update threshold when running REINDEX

-- Recommended: Option 1 with automated monthly recreation
-- Add to pg_cron schedule:
-- SELECT cron.schedule(
--     'recreate-portfolio-recent-index',
--     '0 2 1 * *',  -- 2 AM on 1st of each month
--     $$
--     DROP INDEX CONCURRENTLY IF EXISTS idx_portfolio_snapshots_wallet_recent;
--     CREATE INDEX CONCURRENTLY idx_portfolio_snapshots_wallet_recent
--     ON portfolio_item_snapshots (wallet, snapshot_at DESC)
--     WHERE snapshot_at >= CURRENT_TIMESTAMP - INTERVAL '90 days';
--     ANALYZE portfolio_item_snapshots;
--     $$
-- );

-- ============================================================================
-- Rollback Plan
-- ============================================================================
-- If index causes issues, drop it with CONCURRENTLY
-- ============================================================================

-- DROP INDEX CONCURRENTLY IF EXISTS idx_portfolio_snapshots_wallet_recent;

-- ============================================================================
-- Index Cleanup Consideration
-- ============================================================================
-- After confirming this partial index is being used effectively, consider
-- dropping the old date-only index if it's no longer needed:
--
-- DROP INDEX CONCURRENTLY IF EXISTS idx_portfolio_snapshots_snapshot_at;
--
-- This would save ~10-15 MB and reduce index maintenance overhead.
-- Only do this after monitoring shows the date-only index is unused.
-- ============================================================================

-- ============================================================================
-- Notes
-- ============================================================================
-- 1. Partial index benefits:
--    - Smaller size (only indexes last 90 days of data)
--    - Faster to scan (fewer pages to read)
--    - More attractive to query planner for wallet-first scans
--    - Covers all ROI lookback periods (max 30 days)
--
-- 2. Why 90 days threshold?
--    - Covers all ROI windows (7d, 14d, 30d)
--    - Provides buffer for extended lookbacks
--    - Balances index size vs coverage
--
-- 3. Index selectivity:
--    - Full table: 40,659 rows
--    - Last 90 days: ~11,000 rows (27% of table)
--    - Index size: ~2-5 MB vs ~15-20 MB for full index
--
-- 4. Query planner decision factors:
--    - Smaller index = fewer I/O operations
--    - Wallet-first ordering = better filter pushdown
--    - Partial WHERE clause = index guaranteed to match query filter
--
-- 5. CONCURRENTLY creates index without blocking writes
--    - Takes longer to build but no downtime
--    - Safe for production deployment
--
-- 6. This index works in conjunction with Phase 1 wallet_token_snapshots index
--    - Combined effect: 8.2s → 1.0s (87% improvement)
-- ============================================================================
