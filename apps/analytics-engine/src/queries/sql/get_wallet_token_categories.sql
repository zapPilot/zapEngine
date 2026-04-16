-- Get wallet token categories with aggregated values and percentages
WITH latest_tokens AS (
    SELECT
        user_wallet_address,
        MAX(snapshot_date) AS snapshot_date
    FROM
        alpha_raw.daily_wallet_token_snapshots
    WHERE
        is_wallet = TRUE
        AND user_wallet_address = :wallet_address
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
)
SELECT
    LOWER(user_wallet_address) AS wallet_address,
    category,
    SUM(value) AS category_value,
    SUM(token_count) AS token_count,
    ROUND(
        (
            SUM(value) / NULLIF(
                SUM(SUM(value)) OVER (PARTITION BY user_wallet_address),
                0
            ) * 100
        ) :: numeric,
        2
    ) AS percentage
FROM
    categorized_tokens
GROUP BY
    user_wallet_address,
    category
ORDER BY
    category_value DESC;
