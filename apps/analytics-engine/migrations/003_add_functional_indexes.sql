-- Migration 003: Add Functional Indexes for Date-Based Queries
-- Purpose: Optimize DATE_TRUNC() and DATE() expressions used in portfolio queries
-- Expected Impact: 40-60% reduction in SQL query latency
-- Build Time: ~45 minutes total (CONCURRENTLY for zero downtime)
-- Storage: ~40 MB total

-- CRITICAL: These indexes require IMMUTABLE expressions
-- Solution: Use "AT TIME ZONE 'UTC'" to anchor timezone calculations

-- Index 1: Optimize DATE_TRUNC() grouping in portfolio trend queries
-- Used by: get_portfolio_category_trend_by_user_id.sql
CREATE INDEX CONCURRENTLY idx_portfolio_snapshots_date_bucket
ON portfolio_item_snapshots (
    ((snapshot_at AT TIME ZONE 'UTC')::date),
    wallet
);

-- Index 2: Optimize exact date matching in pool performance queries
-- Used by: get_pool_performance_by_user.sql
CREATE INDEX CONCURRENTLY idx_portfolio_snapshots_wallet_date_exact
ON portfolio_item_snapshots (
    wallet,
    ((snapshot_at AT TIME ZONE 'UTC')::date),
    snapshot_at DESC
);

-- Update query planner statistics
ANALYZE portfolio_item_snapshots;

-- Verify indexes were created successfully
SELECT
    indexname,
    pg_size_pretty(pg_relation_size(indexname::regclass)) AS index_size
FROM pg_indexes
WHERE tablename = 'portfolio_item_snapshots'
  AND indexname IN (
      'idx_portfolio_snapshots_date_bucket',
      'idx_portfolio_snapshots_wallet_date_exact'
  );

-- Example query to verify index usage:
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT
--     (snapshot_at AT TIME ZONE 'UTC')::date AS date,
--     SUM(net_usd_value) AS total
-- FROM portfolio_item_snapshots
-- WHERE wallet = '0x1234...'
--   AND snapshot_at >= NOW() - INTERVAL '365 days'
-- GROUP BY (snapshot_at AT TIME ZONE 'UTC')::date;
--
-- Expected output should include:
-- "Index Scan using idx_portfolio_snapshots_date_bucket"
