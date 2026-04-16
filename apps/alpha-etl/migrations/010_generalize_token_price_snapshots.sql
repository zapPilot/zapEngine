-- Migration 010: Generalize BTC price snapshots to support multiple tokens
-- Author: AI Assistant
-- Date: 2025-01-20
-- Description: Refactors btc_price_snapshots table to token_price_snapshots
--              to support BTC, ETH, SOL, and other cryptocurrencies
--
-- Changes:
-- 1. Add token_symbol (e.g., 'BTC', 'ETH', 'SOL') and token_id (CoinGecko ID) columns
-- 2. Update unique constraint to include token_symbol
-- 3. Add index on token_symbol for filtering performance
-- 4. Rename table to token_price_snapshots
--
-- Backward Compatibility: Existing BTC data is preserved with defaults
-- Rollback: See plan file for rollback SQL commands

BEGIN;

-- Step 1: Add token columns with defaults (allows existing rows to be backfilled)
ALTER TABLE alpha_raw.btc_price_snapshots
ADD COLUMN token_symbol TEXT DEFAULT 'BTC',
ADD COLUMN token_id TEXT DEFAULT 'bitcoin';

-- Step 2: Make columns NOT NULL after defaults populate existing rows
ALTER TABLE alpha_raw.btc_price_snapshots
ALTER COLUMN token_symbol SET NOT NULL,
ALTER COLUMN token_id SET NOT NULL;

-- Step 3: Drop old unique constraint (source, snapshot_date)
DROP INDEX IF EXISTS alpha_raw.idx_btc_price_snapshots_unique_snapshot;

-- Step 4: Create new unique constraint (source, token_symbol, snapshot_date)
CREATE UNIQUE INDEX idx_token_price_snapshots_unique_snapshot
    ON alpha_raw.btc_price_snapshots (source, token_symbol, snapshot_date);

-- Step 5: Add index on token_symbol for filtering performance
CREATE INDEX idx_token_price_snapshots_token_symbol
    ON alpha_raw.btc_price_snapshots (token_symbol);

-- Step 6: Rename table to reflect multi-token purpose
ALTER TABLE alpha_raw.btc_price_snapshots
RENAME TO token_price_snapshots;

-- Step 7: Update comments
COMMENT ON TABLE alpha_raw.token_price_snapshots IS
    'Historical cryptocurrency price snapshots for portfolio benchmarking (BTC, ETH, SOL, etc.)';
COMMENT ON COLUMN alpha_raw.token_price_snapshots.token_symbol IS
    'Token symbol (e.g., BTC, ETH, SOL) - uppercased';
COMMENT ON COLUMN alpha_raw.token_price_snapshots.token_id IS
    'CoinGecko token ID (e.g., bitcoin, ethereum, solana)';
COMMENT ON COLUMN alpha_raw.token_price_snapshots.price_usd IS
    'Token price in USD at snapshot time';
COMMENT ON COLUMN alpha_raw.token_price_snapshots.snapshot_date IS
    'Date of snapshot (midnight UTC)';

-- Step 8: Rename existing indexes for consistency
ALTER INDEX alpha_raw.idx_btc_price_snapshots_date_desc
RENAME TO idx_token_price_snapshots_date_desc;

COMMIT;

-- Verification queries (run after migration):
-- \d alpha_raw.token_price_snapshots
-- SELECT token_symbol, token_id, COUNT(*) FROM alpha_raw.token_price_snapshots GROUP BY token_symbol, token_id;
