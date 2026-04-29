-- Migration: 016_drop_normalized_score_from_macro_fear_greed
-- Purpose: Remove normalized_score column since macro-fear-greed score is already 0-100 float

BEGIN;

ALTER TABLE alpha_raw.macro_fear_greed_snapshots DROP COLUMN IF EXISTS normalized_score;

-- Drop the CHECK constraint that references normalized_score
ALTER TABLE alpha_raw.macro_fear_greed_snapshots DROP CONSTRAINT IF EXISTS macro_fear_greed_snapshots_normalized_score_check;

COMMIT;