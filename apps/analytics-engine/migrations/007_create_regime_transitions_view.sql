-- Migration: create_regime_transitions_view
-- Purpose: Create a view to derive regime transitions from existing sentiment snapshots
-- instead of maintaining a separate table.

-- 1. Create the regime_id enum type if it doesn't exist
DO $$ BEGIN
    CREATE TYPE regime_id AS ENUM ('ef', 'f', 'n', 'g', 'eg');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create the view
CREATE OR REPLACE VIEW regime_transitions_view AS
WITH ordered_snapshots AS (
    SELECT
        id,
        sentiment_value,
        classification,
        snapshot_time as transitioned_at,
        source,
        -- Get previous classification to detect changes
        LAG(classification) OVER (ORDER BY snapshot_time ASC) as prev_classification
    FROM alpha_raw.sentiment_snapshots
),
transitions AS (
    SELECT
        id,
        classification as to_regime_label,
        -- Compute from_regime derived from prev_classification
        prev_classification as from_regime_label,
        sentiment_value,
        transitioned_at,
        source
    FROM ordered_snapshots
    WHERE
        -- It's a transition if classification changed
        classification != prev_classification
        -- Or if it's the very first record (no history)
        OR prev_classification IS NULL
),
mapped_transitions AS (
    SELECT
        id,
        -- Map text labels to RegimeId enum values (ef, f, n, g, eg)
        CASE to_regime_label
            WHEN 'Extreme Fear' THEN 'ef'
            WHEN 'Fear' THEN 'f'
            WHEN 'Neutral' THEN 'n'
            WHEN 'Greed' THEN 'g'
            WHEN 'Extreme Greed' THEN 'eg'
        END::regime_id as to_regime,
        CASE from_regime_label
            WHEN 'Extreme Fear' THEN 'ef'
            WHEN 'Fear' THEN 'f'
            WHEN 'Neutral' THEN 'n'
            WHEN 'Greed' THEN 'g'
            WHEN 'Extreme Greed' THEN 'eg'
        END::regime_id as from_regime,
        sentiment_value,
        transitioned_at,
        source
    FROM transitions
)
SELECT * FROM mapped_transitions;

-- Grant permissions
GRANT SELECT ON regime_transitions_view TO service_role;
GRANT SELECT ON regime_transitions_view TO authenticated;
GRANT SELECT ON regime_transitions_view TO anon;
