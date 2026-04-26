-- Migration 014: Create stock_price_dma_snapshots table for S&P500 200-DMA metrics
-- Author: AI Assistant
-- Date: 2026-04-25
-- Description: Stores computed 200-day simple moving average (SMA) for SPY prices.
--              Derived from stock_price_snapshots.
--              Used for regime detection: price above 200 DMA = uptrend.

-- Source: alpha_raw.stock_price_snapshots
-- Schedule: Triggered after stock-price pipeline completes

BEGIN;

CREATE TABLE alpha_raw.stock_price_dma_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol TEXT NOT NULL,                 -- 'SPY'
    snapshot_date DATE NOT NULL,           -- Date of calculation
    price_usd NUMERIC(18, 8) NOT NULL,     -- Current price (from source table)
    dma_200 NUMERIC(18, 8),               -- 200-day SMA (NULL if < 200 days of data)
    price_vs_dma_ratio NUMERIC(10, 6),    -- price_usd / dma_200
    is_above_dma BOOLEAN,                -- price_usd > dma_200
    days_available INTEGER NOT NULL,      -- Actual days used in calculation
    source TEXT NOT NULL DEFAULT 'alphavantage',
    snapshot_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint: one DMA row per symbol per date per source
CREATE UNIQUE INDEX idx_stock_price_dma_unique
    ON alpha_raw.stock_price_dma_snapshots (source, symbol, snapshot_date);

-- Index for latest DMA queries
CREATE INDEX idx_stock_price_dma_date_desc
    ON alpha_raw.stock_price_dma_snapshots (symbol, snapshot_date DESC);

COMMENT ON TABLE alpha_raw.stock_price_dma_snapshots IS
    '200-day moving average snapshots for S&P500 prices, used for regime detection';
COMMENT ON COLUMN alpha_raw.stock_price_dma_snapshots.dma_200 IS
    '200-day simple moving average of price_usd. NULL when fewer than 200 days of data available';
COMMENT ON COLUMN alpha_raw.stock_price_dma_snapshots.price_vs_dma_ratio IS
    'Ratio of current price to 200 DMA. >1.0 means price is above DMA (bullish)';
COMMENT ON COLUMN alpha_raw.stock_price_dma_snapshots.is_above_dma IS
    'Boolean regime flag: true = price above 200 DMA (uptrend), false = below (downtrend)';

COMMIT;

-- Verification:
-- \d alpha_raw.stock_price_dma_snapshots
-- SELECT COUNT(*) FROM alpha_raw.stock_price_dma_snapshots;