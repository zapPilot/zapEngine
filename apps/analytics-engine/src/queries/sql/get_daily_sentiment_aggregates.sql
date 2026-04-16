-- Get daily aggregated sentiment values for time series alignment
--
-- Aggregates intraday sentiment snapshots to daily averages, min, max for alignment
-- with daily token price data. This enables temporal synchronization between sentiment
-- data (multiple snapshots per day) and price data (one snapshot per day).
--
-- Note: Aggregates across ALL sources (alternative.me, coinmarketcap, etc.) to maximize
-- data coverage. Uses MODE() to determine the most common classification for each day.
--
-- Parameters:
--   :start_date (DATE, optional): Start date (inclusive). If NULL, fetches all data.
--   :end_date (DATE, optional): End date (inclusive). If NULL, fetches all data.
--
-- Returns:
--   snapshot_date: DATE - The day for aggregated sentiment
--   avg_sentiment: NUMERIC(5,2) - Average sentiment value for the day
--   min_sentiment: INTEGER - Minimum sentiment value for the day
--   max_sentiment: INTEGER - Maximum sentiment value for the day
--   snapshot_count: INTEGER - Number of sentiment snapshots in the day
--   primary_classification: TEXT - Most common classification for the day (MODE)

SELECT
    DATE(snapshot_time AT TIME ZONE 'UTC') as snapshot_date,
    AVG(sentiment_value)::numeric(5,2) as avg_sentiment,
    MIN(sentiment_value) as min_sentiment,
    MAX(sentiment_value) as max_sentiment,
    COUNT(*) as snapshot_count,
    MODE() WITHIN GROUP (ORDER BY classification) as primary_classification
FROM alpha_raw.sentiment_snapshots
WHERE
    (CAST(:start_date AS DATE) IS NULL OR snapshot_time >= CAST(:start_date AS TIMESTAMP))
    AND (CAST(:end_date AS DATE) IS NULL OR snapshot_time < CAST(:end_date AS TIMESTAMP) + INTERVAL '1 day')
GROUP BY 1
ORDER BY 1 ASC
