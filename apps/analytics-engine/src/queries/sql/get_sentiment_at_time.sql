SELECT
    sentiment_value,
    classification,
    source,
    snapshot_time
FROM alpha_raw.sentiment_snapshots
WHERE snapshot_time >= :target_time - INTERVAL '24 hours'
    AND snapshot_time <= :target_time + INTERVAL '24 hours'
ORDER BY ABS(EXTRACT(EPOCH FROM (snapshot_time - :target_time)))
LIMIT 1
