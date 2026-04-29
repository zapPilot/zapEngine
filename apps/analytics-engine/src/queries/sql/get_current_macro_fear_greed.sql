SELECT
  snapshot_date,
  score,
  label,
  source,
  provider_updated_at,
  raw_rating
FROM alpha_raw.macro_fear_greed_snapshots
ORDER BY provider_updated_at DESC
LIMIT 1
