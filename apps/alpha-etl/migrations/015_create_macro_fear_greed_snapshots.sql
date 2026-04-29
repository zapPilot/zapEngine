-- Migration: 015_create_macro_fear_greed_snapshots
-- Purpose: Store CNN US equity Fear & Greed snapshots separately from crypto FGI.

BEGIN;

CREATE TABLE IF NOT EXISTS alpha_raw.macro_fear_greed_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date DATE NOT NULL,
    score NUMERIC(6, 2) NOT NULL CHECK (score >= 0 AND score <= 100),
    normalized_score INTEGER NOT NULL CHECK (normalized_score >= 0 AND normalized_score <= 100),
    label TEXT NOT NULL CHECK (label IN ('extreme_fear', 'fear', 'neutral', 'greed', 'extreme_greed')),
    source TEXT NOT NULL DEFAULT 'cnn_fear_greed_unofficial',
    provider_updated_at TIMESTAMPTZ NOT NULL,
    raw_rating TEXT,
    raw_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_macro_fear_greed_unique_source_date
    ON alpha_raw.macro_fear_greed_snapshots (source, snapshot_date);

CREATE INDEX IF NOT EXISTS idx_macro_fear_greed_snapshot_date_desc
    ON alpha_raw.macro_fear_greed_snapshots (snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_macro_fear_greed_source_date_desc
    ON alpha_raw.macro_fear_greed_snapshots (source, snapshot_date DESC);

COMMENT ON TABLE alpha_raw.macro_fear_greed_snapshots IS
    'CNN US equity Fear & Greed snapshots. Kept separate from crypto sentiment_snapshots.';
COMMENT ON COLUMN alpha_raw.macro_fear_greed_snapshots.snapshot_date IS
    'UTC date for the provider update timestamp.';
COMMENT ON COLUMN alpha_raw.macro_fear_greed_snapshots.score IS
    'Raw CNN Fear & Greed score clamped to 0..100.';
COMMENT ON COLUMN alpha_raw.macro_fear_greed_snapshots.normalized_score IS
    'Rounded CNN Fear & Greed score for strategy usage.';
COMMENT ON COLUMN alpha_raw.macro_fear_greed_snapshots.label IS
    'Normalized label: extreme_fear, fear, neutral, greed, extreme_greed.';
COMMENT ON COLUMN alpha_raw.macro_fear_greed_snapshots.source IS
    'Data source identifier. CNN endpoint is unofficial/internal.';

COMMIT;
