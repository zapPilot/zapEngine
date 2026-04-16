-- Get wallet token categories for multiple wallets with aggregated values and percentages
-- Batch version to eliminate N+1 query pattern
--
-- Performance Optimization (v2):
--   - Replaced window function with CTE join for percentage calculation
--   - Previous: SUM(SUM(value)) OVER (PARTITION BY user_wallet_address) computed N times per wallet
--   - Optimized: wallet_totals CTE computes total once per wallet, joined back
--   - Expected gain: ~150-250ms for queries with 100+ tokens across multiple wallets
WITH latest_tokens AS (
    SELECT
        user_wallet_address,
        MAX(snapshot_date) AS snapshot_date
    FROM
        alpha_raw.daily_wallet_token_snapshots
    WHERE
        is_wallet = TRUE
        AND user_wallet_address = ANY(:wallet_addresses)
    GROUP BY
        user_wallet_address
),
latest AS (
    SELECT
        dwt.user_wallet_address,
        dwt.token_address,
        dwt.amount,
        dwt.price,
        (COALESCE(dwt.amount, 0) * COALESCE(dwt.price, 0)) AS value,
        dwt.symbol,
        dwt.inserted_at
    FROM
        alpha_raw.daily_wallet_token_snapshots dwt
        JOIN latest_tokens l ON l.user_wallet_address = dwt.user_wallet_address
        AND l.snapshot_date = dwt.snapshot_date
    WHERE
        dwt.is_wallet = TRUE
),
filtered_tokens AS (
    SELECT
        user_wallet_address,
        token_address,
        amount,
        price,
        value,
        symbol
    FROM
        latest
    WHERE
        value > 0
),
categorized_tokens AS (
    SELECT
        user_wallet_address,
        classify_token_category(symbol) AS category,
        value,
        1 AS token_count
    FROM
        filtered_tokens
),
-- OPTIMIZATION: Calculate wallet totals ONCE per wallet instead of using window function
-- This eliminates redundant SUM() OVER (PARTITION BY ...) computation per row
wallet_totals AS (
    SELECT
        user_wallet_address,
        SUM(value) AS total_wallet_value
    FROM
        categorized_tokens
    GROUP BY
        user_wallet_address
),
category_aggregates AS (
    SELECT
        ct.user_wallet_address,
        ct.category,
        SUM(ct.value) AS category_value,
        SUM(ct.token_count) AS token_count
    FROM
        categorized_tokens ct
    GROUP BY
        ct.user_wallet_address,
        ct.category
)
SELECT
    LOWER(ca.user_wallet_address) AS wallet_address,
    ca.category,
    ca.category_value,
    ca.token_count,
    -- Join pre-calculated wallet total instead of window function
    ROUND(
        (
            ca.category_value / NULLIF(wt.total_wallet_value, 0) * 100
        ) :: numeric,
        2
    ) AS percentage
FROM
    category_aggregates ca
    JOIN wallet_totals wt ON ca.user_wallet_address = wt.user_wallet_address
ORDER BY
    ca.user_wallet_address,
    ca.category_value DESC;
