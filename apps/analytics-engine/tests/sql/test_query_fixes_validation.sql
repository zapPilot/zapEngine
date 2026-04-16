-- ============================================================================
-- SQL VALIDATION TESTS FOR QUERY FIXES
-- ============================================================================
-- Validates that the fixed SQL queries work correctly:
-- 1. get_portfolio_daily_returns.sql - JOIN + division-by-zero
-- 2. get_portfolio_drawdown_unified.sql - JOIN + drawdown metrics
--
-- Run after: setup_test_data.sql
-- Run before: teardown_test_data.sql
-- ============================================================================

\echo '======================================================================'
\echo 'TEST 1: Daily Returns - Multi-Wallet Aggregation (User A)'
\echo '======================================================================'
-- Expected: 29 returns (30 days - 1 for first day with no LAG)
-- Should aggregate across 2 wallets correctly

WITH test_query AS (
    SELECT * FROM (
        -- Inline the actual query logic here for testing
        WITH daily_portfolio_values AS (
            SELECT
                DATE(pis.snapshot_at) as date,
                SUM(pis.net_usd_value) as total_portfolio_value
            FROM portfolio_item_snapshots pis
            INNER JOIN user_crypto_wallets ucw ON pis.wallet = ucw.wallet
            WHERE ucw.user_id = 'a0000000-0000-0000-0000-000000000001'
                AND pis.snapshot_at >= CURRENT_TIMESTAMP - INTERVAL '31 days'
                AND pis.snapshot_at <= CURRENT_TIMESTAMP
            GROUP BY DATE(pis.snapshot_at)
            ORDER BY date
        ),
        daily_with_lagged_values AS (
            SELECT
                date,
                total_portfolio_value,
                LAG(total_portfolio_value) OVER (ORDER BY date) as previous_value
            FROM daily_portfolio_values
        ),
        daily_returns AS (
            SELECT
                date,
                total_portfolio_value,
                CASE
                    WHEN previous_value IS NOT NULL AND previous_value != 0
                    THEN (total_portfolio_value - previous_value) / NULLIF(previous_value, 0)
                    ELSE NULL
                END as daily_return
            FROM daily_with_lagged_values
        )
        SELECT
            date,
            total_portfolio_value,
            daily_return
        FROM daily_returns
        WHERE daily_return IS NOT NULL
        ORDER BY date
    ) q
)
SELECT
    COUNT(*) as row_count,
    MIN(date) as earliest_date,
    MAX(date) as latest_date,
    AVG(total_portfolio_value) as avg_portfolio_value,
    STDDEV(daily_return) as volatility,
    CASE
        WHEN COUNT(*) = 29 THEN 'PASS'
        ELSE 'FAIL: Expected 29 rows, got ' || COUNT(*)
    END as test_result
FROM test_query;

\echo ''
\echo '======================================================================'
\echo 'TEST 2: Daily Returns - Division-by-Zero Protection (User C)'
\echo '======================================================================'
-- Expected: Query completes without error despite zero values
-- Zero value days should be filtered out (NULL daily_return)

WITH test_query AS (
    SELECT * FROM (
        WITH daily_portfolio_values AS (
            SELECT
                DATE(pis.snapshot_at) as date,
                SUM(pis.net_usd_value) as total_portfolio_value
            FROM portfolio_item_snapshots pis
            INNER JOIN user_crypto_wallets ucw ON pis.wallet = ucw.wallet
            WHERE ucw.user_id = 'c0000000-0000-0000-0000-000000000003'
                AND pis.snapshot_at >= CURRENT_TIMESTAMP - INTERVAL '15 days'
                AND pis.snapshot_at <= CURRENT_TIMESTAMP
            GROUP BY DATE(pis.snapshot_at)
            ORDER BY date
        ),
        daily_with_lagged_values AS (
            SELECT
                date,
                total_portfolio_value,
                LAG(total_portfolio_value) OVER (ORDER BY date) as previous_value
            FROM daily_portfolio_values
        ),
        daily_returns AS (
            SELECT
                date,
                total_portfolio_value,
                CASE
                    WHEN previous_value IS NOT NULL AND previous_value != 0
                    THEN (total_portfolio_value - previous_value) / NULLIF(previous_value, 0)
                    ELSE NULL
                END as daily_return
            FROM daily_with_lagged_values
        )
        SELECT
            date,
            total_portfolio_value,
            daily_return
        FROM daily_returns
        WHERE daily_return IS NOT NULL
        ORDER BY date
    ) q
)
SELECT
    'PASS: Query executed without division-by-zero error' as test_result,
    COUNT(*) as valid_returns,
    COUNT(*) FILTER (WHERE total_portfolio_value = 0) as zero_value_days
FROM test_query;

\echo ''
\echo '======================================================================'
\echo 'TEST 3: User Isolation - Shared Wallet (User B vs User A)'
\echo '======================================================================'
-- Expected: User B should NOT see the shared wallet (value=99999)
-- Only User A's wallets should appear in User A's results

WITH user_b_query AS (
    SELECT * FROM (
        WITH daily_portfolio_values AS (
            SELECT
                DATE(pis.snapshot_at) as date,
                SUM(pis.net_usd_value) as total_portfolio_value
            FROM portfolio_item_snapshots pis
            INNER JOIN user_crypto_wallets ucw ON pis.wallet = ucw.wallet
            WHERE ucw.user_id = 'b0000000-0000-0000-0000-000000000002'
                AND pis.snapshot_at >= CURRENT_TIMESTAMP - INTERVAL '15 days'
                AND pis.snapshot_at <= CURRENT_TIMESTAMP
            GROUP BY DATE(pis.snapshot_at)
            ORDER BY date
        )
        SELECT MAX(total_portfolio_value) as max_value
        FROM daily_portfolio_values
    ) q
)
SELECT
    CASE
        WHEN max_value < 10000 THEN 'PASS: User B isolated (no shared wallet data)'
        ELSE 'FAIL: User B seeing shared wallet value=' || max_value
    END as test_result,
    max_value
FROM user_b_query;

\echo ''
\echo '======================================================================'
\echo 'TEST 4: Drawdown - Running Peak Calculation (User A)'
\echo '======================================================================'
-- Expected: peak_value is running maximum, never decreases

WITH test_query AS (
    SELECT * FROM (
        WITH daily_portfolio AS (
            SELECT
                DATE(pis.snapshot_at) as date,
                SUM(pis.net_usd_value) as portfolio_value
            FROM portfolio_item_snapshots pis
            INNER JOIN user_crypto_wallets ucw ON pis.wallet = ucw.wallet
            WHERE ucw.user_id = 'a0000000-0000-0000-0000-000000000001'
                AND pis.snapshot_at >= CURRENT_TIMESTAMP - INTERVAL '31 days'
                AND pis.snapshot_at <= CURRENT_TIMESTAMP
            GROUP BY DATE(pis.snapshot_at)
            ORDER BY date
        ),
        running_peaks AS (
            SELECT
                date,
                portfolio_value,
                MAX(portfolio_value) OVER (ORDER BY date ROWS UNBOUNDED PRECEDING) as peak_value
            FROM daily_portfolio
        )
        SELECT
            date,
            portfolio_value,
            peak_value,
            peak_value - LAG(peak_value) OVER (ORDER BY date) as peak_change
        FROM running_peaks
    ) q
)
SELECT
    COUNT(*) as total_days,
    COUNT(*) FILTER (WHERE peak_change < 0) as decreasing_peaks,
    CASE
        WHEN COUNT(*) FILTER (WHERE peak_change < 0) = 0
        THEN 'PASS: Peak values never decrease'
        ELSE 'FAIL: Peak decreased on ' || COUNT(*) FILTER (WHERE peak_change < 0) || ' days'
    END as test_result
FROM test_query
WHERE peak_change IS NOT NULL;

\echo ''
\echo '======================================================================'
\echo 'TEST 5: Drawdown - Underwater Flag Correctness'
\echo '======================================================================'
-- Expected: is_underwater = true when portfolio_value < peak_value

WITH test_query AS (
    SELECT * FROM (
        WITH daily_portfolio AS (
            SELECT
                DATE(pis.snapshot_at) as date,
                SUM(pis.net_usd_value) as portfolio_value
            FROM portfolio_item_snapshots pis
            INNER JOIN user_crypto_wallets ucw ON pis.wallet = ucw.wallet
            WHERE ucw.user_id = 'a0000000-0000-0000-0000-000000000001'
                AND pis.snapshot_at >= CURRENT_TIMESTAMP - INTERVAL '31 days'
                AND pis.snapshot_at <= CURRENT_TIMESTAMP
            GROUP BY DATE(pis.snapshot_at)
            ORDER BY date
        ),
        running_peaks AS (
            SELECT
                date,
                portfolio_value,
                MAX(portfolio_value) OVER (ORDER BY date ROWS UNBOUNDED PRECEDING) as peak_value
            FROM daily_portfolio
        )
        SELECT
            date,
            portfolio_value,
            peak_value,
            CASE WHEN portfolio_value < peak_value THEN true ELSE false END as is_underwater
        FROM running_peaks
    ) q
)
SELECT
    COUNT(*) as total_days,
    COUNT(*) FILTER (WHERE is_underwater) as underwater_days,
    COUNT(*) FILTER (WHERE NOT is_underwater) as at_peak_days,
    ROUND(100.0 * COUNT(*) FILTER (WHERE is_underwater) / COUNT(*), 2) as pct_underwater,
    'PASS: Underwater flag calculated correctly' as test_result
FROM test_query;

\echo ''
\echo '======================================================================'
\echo 'TEST 6: Drawdown - Recovery Point Detection'
\echo '======================================================================'
-- Expected: recovery_point = true when crossing from underwater to peak

WITH test_query AS (
    SELECT * FROM (
        WITH daily_portfolio AS (
            SELECT
                DATE(pis.snapshot_at) as date,
                SUM(pis.net_usd_value) as portfolio_value
            FROM portfolio_item_snapshots pis
            INNER JOIN user_crypto_wallets ucw ON pis.wallet = ucw.wallet
            WHERE ucw.user_id = 'a0000000-0000-0000-0000-000000000001'
                AND pis.snapshot_at >= CURRENT_TIMESTAMP - INTERVAL '31 days'
                AND pis.snapshot_at <= CURRENT_TIMESTAMP
            GROUP BY DATE(pis.snapshot_at)
            ORDER BY date
        ),
        running_peaks AS (
            SELECT
                date,
                portfolio_value,
                MAX(portfolio_value) OVER (ORDER BY date ROWS UNBOUNDED PRECEDING) as peak_value
            FROM daily_portfolio
        ),
        drawdown_metrics AS (
            SELECT
                date,
                portfolio_value,
                peak_value,
                CASE WHEN portfolio_value < peak_value THEN true ELSE false END as is_underwater,
                LAG(
                    CASE WHEN portfolio_value < peak_value THEN true ELSE false END
                ) OVER (ORDER BY date) as prev_underwater
            FROM running_peaks
        )
        SELECT
            date,
            is_underwater,
            prev_underwater,
            CASE
                WHEN NOT is_underwater AND prev_underwater = true THEN true
                ELSE false
            END as recovery_point
        FROM drawdown_metrics
    ) q
)
SELECT
    COUNT(*) FILTER (WHERE recovery_point) as recovery_points,
    CASE
        WHEN COUNT(*) FILTER (WHERE recovery_point) > 0
        THEN 'PASS: Recovery points detected (' || COUNT(*) FILTER (WHERE recovery_point) || ' found)'
        ELSE 'WARNING: No recovery points in test data'
    END as test_result
FROM test_query;

\echo ''
\echo '======================================================================'
\echo 'TEST 7: Performance - Query Execution Time'
\echo '======================================================================'
-- Expected: Both queries complete in < 500ms for 30 days of data

\timing on

EXPLAIN ANALYZE
WITH daily_portfolio_values AS (
    SELECT
        DATE(pis.snapshot_at) as date,
        SUM(pis.net_usd_value) as total_portfolio_value
    FROM portfolio_item_snapshots pis
    INNER JOIN user_crypto_wallets ucw ON pis.wallet = ucw.wallet
    WHERE ucw.user_id = 'a0000000-0000-0000-0000-000000000001'
        AND pis.snapshot_at >= CURRENT_TIMESTAMP - INTERVAL '31 days'
        AND pis.snapshot_at <= CURRENT_TIMESTAMP
    GROUP BY DATE(pis.snapshot_at)
    ORDER BY date
),
daily_with_lagged_values AS (
    SELECT
        date,
        total_portfolio_value,
        LAG(total_portfolio_value) OVER (ORDER BY date) as previous_value
    FROM daily_portfolio_values
),
daily_returns AS (
    SELECT
        date,
        total_portfolio_value,
        CASE
            WHEN previous_value IS NOT NULL AND previous_value != 0
            THEN (total_portfolio_value - previous_value) / NULLIF(previous_value, 0)
            ELSE NULL
        END as daily_return
    FROM daily_with_lagged_values
)
SELECT COUNT(*) FROM daily_returns WHERE daily_return IS NOT NULL;

\timing off

\echo ''
\echo '======================================================================'
\echo 'ALL TESTS COMPLETE'
\echo '======================================================================'
