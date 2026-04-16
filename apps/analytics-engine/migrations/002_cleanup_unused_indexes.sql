-- ============================================================================
-- Phase 3.5 Cleanup: Remove Unused Covering Index
-- ============================================================================
-- Created: 2025-11-16
-- Purpose: Drop the unused covering index v2 that is not being used by query planner
--
-- Background:
-- - idx_portfolio_snapshots_wallet_snapshot_v2 was created as a covering index with INCLUDE clause
-- - Query planner prefers the smaller old index (504 KB vs 36 MB - 71x difference)
-- - The covering index provides no benefit because queries select `pis.*` (all columns)
-- - Removing it will:
--   * Free 36 MB of storage
--   * Improve INSERT/UPDATE performance
--   * Reduce index maintenance overhead
--
-- Migration Strategy:
-- - DROP INDEX CONCURRENTLY (no table locks)
-- - Keep the old efficient index intact
-- - Run ANALYZE to update query planner statistics
-- ============================================================================

-- Drop the unused covering index v2
DROP INDEX CONCURRENTLY IF EXISTS idx_portfolio_snapshots_wallet_snapshot_v2;

-- Update query planner statistics after index removal
ANALYZE portfolio_item_snapshots;
ANALYZE user_crypto_wallets;

-- ============================================================================
-- Verification
-- ============================================================================
-- Verify the index has been dropped
-- SELECT indexname, pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
-- FROM pg_stat_user_indexes
-- WHERE indexname = 'idx_portfolio_snapshots_wallet_snapshot_v2';
-- Expected: No rows returned

-- Verify the old index is still in use
-- SELECT indexname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
-- FROM pg_stat_user_indexes
-- WHERE indexname = 'idx_portfolio_snapshots_wallet_snapshot'
--   AND tablename = 'portfolio_item_snapshots';
-- Expected: idx_scan should be increasing

-- ============================================================================
-- Rollback Plan
-- ============================================================================
-- If needed, recreate the index (not recommended unless query patterns change)
-- CREATE INDEX CONCURRENTLY idx_portfolio_snapshots_wallet_snapshot_v2
-- ON portfolio_item_snapshots (wallet, snapshot_at DESC)
-- INCLUDE (net_usd_value, asset_usd_value, asset_token_list, chain, name);
-- ============================================================================
