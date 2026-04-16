SELECT
    sentiment_value,
    classification,
    source,
    snapshot_time
FROM alpha_raw.sentiment_snapshots
ORDER BY snapshot_time DESC
LIMIT 1
