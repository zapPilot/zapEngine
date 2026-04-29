SELECT DISTINCT ON (snapshot_date)
    snapshot_date,
    score,
    normalized_score,
    label,
    source,
    provider_updated_at,
    raw_rating
FROM alpha_raw.macro_fear_greed_snapshots
WHERE
    (CAST(:start_date AS DATE) IS NULL OR snapshot_date >= CAST(:start_date AS DATE))
    AND (CAST(:end_date AS DATE) IS NULL OR snapshot_date <= CAST(:end_date AS DATE))
ORDER BY snapshot_date ASC, provider_updated_at DESC
