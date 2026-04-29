SELECT
    sentiment_value,
    classification,
    source,
    snapshot_time
FROM alpha_raw.sentiment_snapshots
WHERE snapshot_time >= :min_timestamp
  AND (:max_timestamp IS NULL OR snapshot_time <= :max_timestamp)
ORDER BY snapshot_time ASC
