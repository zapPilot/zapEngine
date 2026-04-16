-- Landing Page Performance Optimization Indexes
-- Created: 2025-01-13
-- Purpose: Eliminate sequential scans and improve query performance for landing page endpoint
--
-- These indexes address the 21-second load time issue by:
-- 1. Optimizing portfolio snapshot queries
-- 2. Speeding up wallet token lookups
-- 3. Improving user wallet joins
--
-- Execute with CONCURRENTLY to avoid blocking production traffic

-- Index 1: Portfolio snapshots lookup by wallet and date
-- Speeds up latest snapshot queries (used by PortfolioSnapshotService)
-- Note: Previously used by get_landing_page_portfolio_summary.sql (replaced in commit 92e94b1)
-- Estimated impact: -0.5s on portfolio summary query
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_portfolio_snapshots_wallet_date
ON portfolio_item_snapshots(wallet, snapshot_at DESC)
INCLUDE (asset_token_list);

-- Index 2: Wallet token snapshots for batch queries
-- Eliminates sequential scan in get_wallet_token_categories_batch.sql
-- Estimated impact: -4s on wallet N+1 queries (now batched)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_snapshots_address_time
ON alpha_raw.wallet_token_snapshots(user_wallet_address, inserted_at DESC)
WHERE is_wallet = TRUE;

-- Index 3: User wallet lookup
-- Speeds up wallet address retrieval in get_user_wallets.sql
-- Estimated impact: -0.2s on wallet address fetch
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_wallets_lookup
ON user_crypto_wallets(user_id)
INCLUDE (wallet);

-- Index 4: Pool APR snapshots for LATERAL join optimization
-- Improves APR summary query performance in get_portfolio_apr_summary_optimized.sql
-- Estimated impact: -1.5s on APR LATERAL joins
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pool_apr_chain_time_symbol
ON alpha_raw.pool_apr_snapshots(chain, snapshot_time DESC, symbol)
WHERE snapshot_time >= NOW() - INTERVAL '7 days';

-- Index 5: Portfolio snapshots for user-based queries
-- Supports ROI calculator and historical trend queries
-- Estimated impact: -2s on ROI historical queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_portfolio_snapshots_user_date
ON portfolio_item_snapshots(user_id, snapshot_at DESC)
WHERE snapshot_at >= NOW() - INTERVAL '1 year';

-- Verification queries to check index usage
-- Run these after creating indexes to verify they're being used:

-- Check portfolio snapshot index usage:
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT *
-- FROM portfolio_item_snapshots
-- WHERE wallet = 'sample_wallet'
-- ORDER BY snapshot_at DESC
-- LIMIT 1;

-- Check wallet token snapshot index usage:
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT *
-- FROM alpha_raw.wallet_token_snapshots
-- WHERE is_wallet = TRUE
--   AND user_wallet_address = ANY(ARRAY['wallet1', 'wallet2'])
-- ORDER BY inserted_at DESC;

-- Monitor index usage after deployment:
-- SELECT
--     schemaname,
--     tablename,
--     indexname,
--     idx_scan,
--     idx_tup_read,
--     idx_tup_fetch
-- FROM pg_stat_user_indexes
-- WHERE indexname LIKE 'idx_%'
-- ORDER BY idx_scan DESC;
