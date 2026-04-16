-- Migration 011: Create token_price_dma_snapshots table for 200-day moving average metrics
-- Author: AI Assistant
-- Date: 2026-02-08
-- Description: Stores computed 200-day simple moving average (DMA) for token prices.
--              Derived from token_price_snapshots (source table).
--              Used as a regime indicator: price above 200 DMA = uptrend, below = downtrend.
--
-- Source: alpha_raw.token_price_snapshots
-- Schedule: Triggered by token price pipeline after /webhooks/backfill writes

BEGIN;

CREATE TABLE alpha_raw.token_price_dma_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_symbol TEXT NOT NULL,             -- 'BTC', 'ETH'
    token_id TEXT NOT NULL,                 -- 'bitcoin', 'ethereum'
    snapshot_date DATE NOT NULL,            -- Date of calculation
    price_usd NUMERIC(18, 8) NOT NULL,     -- Current price (from source table)
    dma_200 NUMERIC(18, 8),                -- 200-day SMA (NULL if < 200 days of data)
    price_vs_dma_ratio NUMERIC(10, 6),     -- price_usd / dma_200
    is_above_dma BOOLEAN,                  -- price_usd > dma_200
    days_available INTEGER NOT NULL,        -- Actual days used in calculation
    source TEXT NOT NULL DEFAULT 'coingecko',
    snapshot_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint: one DMA row per token per date per source
CREATE UNIQUE INDEX idx_token_price_dma_unique
    ON alpha_raw.token_price_dma_snapshots (source, token_symbol, snapshot_date);

-- Latest DMA queries (most common access pattern)
CREATE INDEX idx_token_price_dma_date_desc
    ON alpha_raw.token_price_dma_snapshots (token_symbol, snapshot_date DESC);

COMMENT ON TABLE alpha_raw.token_price_dma_snapshots IS
    '200-day moving average snapshots for token prices, used as regime indicator';
COMMENT ON COLUMN alpha_raw.token_price_dma_snapshots.dma_200 IS
    '200-day simple moving average of price_usd. NULL when fewer than 200 days of data available';
COMMENT ON COLUMN alpha_raw.token_price_dma_snapshots.price_vs_dma_ratio IS
    'Ratio of current price to 200 DMA. >1.0 means price is above DMA (bullish)';
COMMENT ON COLUMN alpha_raw.token_price_dma_snapshots.is_above_dma IS
    'Boolean regime flag: true = price above 200 DMA (uptrend), false = below (downtrend)';

COMMIT;

-- Verification queries (run after migration):
-- \d alpha_raw.token_price_dma_snapshots
-- SELECT COUNT(*) FROM alpha_raw.token_price_dma_snapshots;
