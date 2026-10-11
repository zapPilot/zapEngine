-- One snapshot per UTC calendar day: the latest of that day, whichever source
-- wrote it. The table holds a snapshot every ten minutes, and the backtest reads
-- one value per day, so the rest never needs to leave the database.
-- The cast types a null upper bound, which Postgres cannot infer from IS NULL.
SELECT DISTINCT ON ((snapshot_time AT TIME ZONE 'UTC')::date)
    sentiment_value,
    classification,
    source,
    snapshot_time
FROM alpha_raw.sentiment_snapshots
WHERE snapshot_time >= :min_timestamp
  AND (
    CAST(:max_timestamp AS timestamptz) IS NULL
    OR snapshot_time <= CAST(:max_timestamp AS timestamptz)
  )
ORDER BY (snapshot_time AT TIME ZONE 'UTC')::date ASC, snapshot_time DESC
