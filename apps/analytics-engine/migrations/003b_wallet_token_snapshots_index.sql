-- ============================================================================
-- Phase 3.5 Optimization: Wallet Token Snapshots Composite Index
-- ============================================================================
-- Created: 2025-11-16
-- Purpose: Optimize ROI calculation query performance
--
-- Performance Problem:
-- - ROI query takes 5.3 seconds (64% of landing page endpoint time)
-- - wallet_token_snapshots scan: 2,820ms (45% of ROI query)
-- - Scans 68,665 rows → filters to 12,787 rows (81% waste)
-- - Uses `inserted_at` index only, doesn't filter by wallet first
--
-- Root Cause:
-- - Missing composite index on (user_wallet_address, inserted_at, is_wallet)
-- - Query filters by wallet AFTER scanning all time-range rows
-- - No index pushdown for `is_wallet = TRUE` predicate
--
-- Solution:
-- - Create composite index with wallet-first ordering
-- - Add partial index filter for `is_wallet = TRUE` (reduces index size)
-- - Enable wallet-first filtering before date filtering
--
-- Expected Impact:
-- - ROI query: 5.3s → 2.5s (47% faster)
-- - Landing page total: 8.2s → 5.4s (34% faster)
-- - Row scans: 68,665 → ~680 (99% reduction)
--
-- Migration Strategy:
-- - CREATE INDEX CONCURRENTLY (no table locks)
-- - Estimated build time: 2-3 minutes (185K rows)
-- - Run ANALYZE to update query planner statistics
-- ============================================================================

-- Create composite index with wallet-first ordering and partial index filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_token_snapshots_wallet_time_wallet
ON alpha_raw.wallet_token_snapshots (user_wallet_address, inserted_at DESC, is_wallet)
WHERE is_wallet = TRUE;

-- Update query planner statistics after index creation
ANALYZE alpha_raw.wallet_token_snapshots;

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
-- WHERE indexname = 'idx_wallet_token_snapshots_wallet_time_wallet';
-- Expected: Index exists with size ~5-10 MB

-- Verify index is being used by ROI query
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT *
-- FROM alpha_raw.wallet_token_snapshots
-- WHERE user_wallet_address IN (
--     SELECT wallet
--     FROM user_crypto_wallets
--     WHERE user_id = '5fc63d4e-4e07-47d8-840b-ccd3420d553f'
-- )
--   AND inserted_at >= CURRENT_TIMESTAMP - INTERVAL '31 days'
--   AND is_wallet = TRUE;
-- Expected: "Index Scan using idx_wallet_token_snapshots_wallet_time_wallet"
-- Expected execution time: < 100ms (vs 2,820ms before)

-- ============================================================================
-- Monitoring Queries
-- ============================================================================
-- Track index usage and performance after deployment
-- ============================================================================

-- Monitor index scan counts over time
-- SELECT
--     schemaname,
--     tablename,
--     indexname,
--     idx_scan AS scans,
--     idx_tup_read AS tuples_read,
--     idx_tup_fetch AS tuples_fetched,
--     pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
-- FROM pg_stat_user_indexes
-- WHERE indexname = 'idx_wallet_token_snapshots_wallet_time_wallet'
-- ORDER BY idx_scan DESC;

-- ============================================================================
-- Rollback Plan
-- ============================================================================
-- If index causes issues, drop it with CONCURRENTLY
-- ============================================================================

-- DROP INDEX CONCURRENTLY IF EXISTS alpha_raw.idx_wallet_token_snapshots_wallet_time_wallet;

-- ============================================================================
-- Notes
-- ============================================================================
-- 1. This index is critical for ROI calculation performance
--    - Used by get_portfolio_category_trend_by_user_id.sql
--    - Called by ROICalculator._fetch_portfolio_snapshots()
--
-- 2. Partial index (WHERE is_wallet = TRUE) reduces index size by ~50%
--    - Only indexes wallet rows (not individual token rows)
--
-- 3. Composite index ordering: (user_wallet_address, inserted_at DESC, is_wallet)
--    - Wallet first: enables wallet-based filtering
--    - Date descending: matches ORDER BY in query
--    - is_wallet included: supports index-only scans
--
-- 4. CONCURRENTLY creates index without blocking writes
--    - Takes longer to build but no downtime
--    - Requires more disk space temporarily
--
-- 5. Monitor pg_stat_activity during index build to track progress
--    - Query: SELECT * FROM pg_stat_activity WHERE query LIKE '%wallet_token_snapshots%';
-- ============================================================================
