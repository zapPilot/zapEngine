-- Migration 013: Create stock_price_snapshots table for S&P500 (SPY) price data
-- Author: AI Assistant
-- Date: 2026-04-25
-- Description: Stores daily S&P500 ETF (SPY) price data from Alpha Vantage API.
--              Mirrors token_price_snapshots structure for consistency.
--              Used for portfolio rotation decisions (crypto vs S&P500).

-- Data Source: Alpha Vantage API (TIME_SERIES_DAILY_ADJUSTED)
-- Schedule: Same Pipedream webhook as token-price (daily)

BEGIN;

CREATE TABLE alpha_raw.stock_price_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol TEXT NOT NULL,            -- 'SPY'
    snapshot_date DATE NOT NULL,      -- Date of snapshot (trading day)
    price_usd NUMERIC(18, 8) NOT NULL, -- Adjusted close price in USD
    source TEXT NOT NULL DEFAULT 'alphavantage',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint: one price per symbol per date per source
CREATE UNIQUE INDEX idx_stock_price_snapshots_unique
    ON alpha_raw.stock_price_snapshots (source, symbol, snapshot_date);

-- Index for symbol filtering and date sorting
CREATE INDEX idx_stock_price_snapshots_symbol_date
    ON alpha_raw.stock_price_snapshots (symbol, snapshot_date DESC);

COMMENT ON TABLE alpha_raw.stock_price_snapshots IS
    'Daily S&P500 ETF (SPY) price snapshots for portfolio rotation decisions';
COMMENT ON COLUMN alpha_raw.stock_price_snapshots.symbol IS
    'Stock/ETF symbol (e.g., SPY, QQQ)';
COMMENT ON COLUMN alpha_raw.stock_price_snapshots.snapshot_date IS
    'Date of snapshot (trading day, not weekend/holiday)';
COMMENT ON COLUMN alpha_raw.stock_price_snapshots.price_usd IS
    'Adjusted close price in USD (adjusted for splits/dividends)';
COMMENT ON COLUMN alpha_raw.stock_price_snapshots.source IS
    'Data source (alphavantage)';

COMMIT;

-- Verification:
-- \d alpha_raw.stock_price_snapshots
-- SELECT symbol, COUNT(*), MIN(snapshot_date), MAX(snapshot_date) 
-- FROM alpha_raw.stock_price_snapshots GROUP BY symbol;