-- Migration 012: Create token_pair_ratio_dma_snapshots table for ETH/BTC relative-strength DMA metrics
-- Author: AI Assistant
-- Date: 2026-03-17
-- Description: Stores computed pair-ratio values and 200-day DMA derived from
--              token_price_snapshots. Initial consumer is ETH/BTC relative strength.

BEGIN;

CREATE TABLE alpha_raw.token_pair_ratio_dma_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_token_symbol TEXT NOT NULL,       -- 'ETH'
    base_token_id TEXT NOT NULL,           -- 'ethereum'
    quote_token_symbol TEXT NOT NULL,      -- 'BTC'
    quote_token_id TEXT NOT NULL,          -- 'bitcoin'
    snapshot_date DATE NOT NULL,
    ratio_value NUMERIC(18, 8) NOT NULL,   -- base / quote
    dma_200 NUMERIC(18, 8),                -- NULL if < 200 overlapping days of data
    ratio_vs_dma_ratio NUMERIC(10, 6),     -- ratio_value / dma_200
    is_above_dma BOOLEAN,                  -- ratio_value > dma_200
    days_available INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'coingecko',
    snapshot_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_token_pair_ratio_dma_unique
    ON alpha_raw.token_pair_ratio_dma_snapshots (
        source,
        base_token_symbol,
        quote_token_symbol,
        snapshot_date
    );

CREATE INDEX idx_token_pair_ratio_dma_date_desc
    ON alpha_raw.token_pair_ratio_dma_snapshots (
        base_token_symbol,
        quote_token_symbol,
        snapshot_date DESC
    );

COMMENT ON TABLE alpha_raw.token_pair_ratio_dma_snapshots IS
    'Pair-ratio moving average snapshots derived from token prices, used for relative-strength signals';
COMMENT ON COLUMN alpha_raw.token_pair_ratio_dma_snapshots.ratio_value IS
    'Pair ratio value computed as base token price divided by quote token price';
COMMENT ON COLUMN alpha_raw.token_pair_ratio_dma_snapshots.dma_200 IS
    '200-day simple moving average of ratio_value. NULL when fewer than 200 overlapping days are available';
COMMENT ON COLUMN alpha_raw.token_pair_ratio_dma_snapshots.ratio_vs_dma_ratio IS
    'Ratio of current pair-ratio value to its 200 DMA. >1.0 means ETH/BTC is above trend';
COMMENT ON COLUMN alpha_raw.token_pair_ratio_dma_snapshots.is_above_dma IS
    'Boolean relative-strength flag: true = ratio above 200 DMA, false = ratio below 200 DMA';

COMMIT;
