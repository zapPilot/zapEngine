-- Migration: 008_create_sentiment_snapshots
-- Created: 2025-01-17
-- Purpose: Create sentiment_snapshots table for historical Fear & Greed Index data
--
-- This table stores sentiment snapshots collected every 10 minutes from alternative.me API
-- Enables directional strategy display based on regime transitions

-- Create sentiment_snapshots table in alpha_raw schema
CREATE TABLE IF NOT EXISTS alpha_raw.sentiment_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sentiment_value INTEGER NOT NULL CHECK (sentiment_value >= 0 AND sentiment_value <= 100),
    classification TEXT NOT NULL CHECK (classification IN ('Extreme Fear', 'Fear', 'Neutral', 'Greed', 'Extreme Greed')),
    source TEXT NOT NULL DEFAULT 'alternative.me',
    snapshot_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
-- Primary index for time-series queries (most recent first)
CREATE INDEX idx_sentiment_snapshots_snapshot_time_desc
    ON alpha_raw.sentiment_snapshots (snapshot_time DESC);

-- Composite index for source + time queries
CREATE INDEX idx_sentiment_snapshots_source_snapshot_time
    ON alpha_raw.sentiment_snapshots (source, snapshot_time DESC);

-- Unique constraint to prevent duplicate snapshots for same source/time
CREATE UNIQUE INDEX idx_sentiment_snapshots_unique_snapshot
    ON alpha_raw.sentiment_snapshots (source, snapshot_time);

-- Permissions
-- NOTE: Execute these GRANT statements manually with service_role credentials
-- GRANT SELECT ON alpha_raw.sentiment_snapshots TO readonly_user;
-- GRANT INSERT, SELECT ON alpha_raw.sentiment_snapshots TO alpha_etl_user;

-- Table comment
COMMENT ON TABLE alpha_raw.sentiment_snapshots IS 'Historical Fear & Greed Index snapshots collected every 10 minutes via alpha-etl ETL pipeline';

-- Column comments
COMMENT ON COLUMN alpha_raw.sentiment_snapshots.sentiment_value IS 'Fear & Greed Index value (0-100): 0=Extreme Fear, 100=Extreme Greed';
COMMENT ON COLUMN alpha_raw.sentiment_snapshots.classification IS 'Regime classification: Extreme Fear (0-25), Fear (26-45), Neutral (46-54), Greed (55-75), Extreme Greed (76-100)';
COMMENT ON COLUMN alpha_raw.sentiment_snapshots.source IS 'Data source identifier (default: alternative.me)';
COMMENT ON COLUMN alpha_raw.sentiment_snapshots.snapshot_time IS 'Timestamp when sentiment was recorded (from API response)';
COMMENT ON COLUMN alpha_raw.sentiment_snapshots.raw_data IS 'Complete API response payload for debugging and audit trail';
