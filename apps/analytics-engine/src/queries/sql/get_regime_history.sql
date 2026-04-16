SELECT
    id,
    from_regime,
    to_regime,
    sentiment_value,
    transitioned_at,
    source
FROM regime_transitions_view
WHERE (:since IS NULL OR transitioned_at >= :since)
ORDER BY transitioned_at DESC
LIMIT :limit
