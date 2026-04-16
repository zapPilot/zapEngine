-- Migration: 009_create_btc_price_snapshots
-- Created: 2025-01-23
-- Purpose: Create btc_price_snapshots table for portfolio benchmarking
--
-- This table stores daily BTC price snapshots collected from CoinGecko API
-- Enables performance comparison between user portfolios and BTC buy-and-hold strategy

-- Create BTC price snapshots table in alpha_raw schema
CREATE TABLE IF NOT EXISTS alpha_raw.btc_price_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    price_usd NUMERIC(18, 8) NOT NULL CHECK (price_usd > 0),
    market_cap_usd NUMERIC(20, 2),
    volume_24h_usd NUMERIC(20, 2),
    source TEXT NOT NULL DEFAULT 'coingecko',
    snapshot_date DATE NOT NULL,
    snapshot_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
-- Primary index for time-series queries (most recent first)
CREATE INDEX idx_btc_price_snapshots_date_desc
    ON alpha_raw.btc_price_snapshots (snapshot_date DESC);

-- Unique constraint to prevent duplicate snapshots for same source/date
CREATE UNIQUE INDEX idx_btc_price_snapshots_unique_snapshot
    ON alpha_raw.btc_price_snapshots (source, snapshot_date);

-- Composite index for source + date range queries
CREATE INDEX idx_btc_price_snapshots_source_date
    ON alpha_raw.btc_price_snapshots (source, snapshot_date);

-- Permissions
-- NOTE: Execute these GRANT statements manually with service_role credentials
-- GRANT SELECT ON alpha_raw.btc_price_snapshots TO readonly_user;
-- GRANT INSERT, SELECT ON alpha_raw.btc_price_snapshots TO alpha_etl_user;

-- Table comment
COMMENT ON TABLE alpha_raw.btc_price_snapshots IS 'Daily BTC price snapshots for portfolio benchmarking collected from CoinGecko API via alpha-etl';

-- Column comments
COMMENT ON COLUMN alpha_raw.btc_price_snapshots.id IS 'Unique identifier for each snapshot';
COMMENT ON COLUMN alpha_raw.btc_price_snapshots.price_usd IS 'BTC price in USD at snapshot time (up to 8 decimal places for precision)';
COMMENT ON COLUMN alpha_raw.btc_price_snapshots.market_cap_usd IS 'Total BTC market capitalization in USD';
COMMENT ON COLUMN alpha_raw.btc_price_snapshots.volume_24h_usd IS '24-hour trading volume in USD';
COMMENT ON COLUMN alpha_raw.btc_price_snapshots.source IS 'Data source identifier (default: coingecko)';
COMMENT ON COLUMN alpha_raw.btc_price_snapshots.snapshot_date IS 'Date of snapshot (midnight UTC) - used for deduplication and queries';
COMMENT ON COLUMN alpha_raw.btc_price_snapshots.snapshot_time IS 'Exact timestamp when snapshot was recorded';
COMMENT ON COLUMN alpha_raw.btc_price_snapshots.raw_data IS 'Complete API response payload for debugging and audit trail';
COMMENT ON COLUMN alpha_raw.btc_price_snapshots.created_at IS 'Record creation timestamp';
