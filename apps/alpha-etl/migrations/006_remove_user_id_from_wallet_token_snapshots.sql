-- Migration 006: Remove user_id from wallet_token_snapshots
-- Purpose: Fix duplicate key constraint violations when same wallet appears multiple times
-- Reason: Wallet balance data should be tied to wallet address (blockchain source), not user_id

-- Step 1: Drop foreign key constraint that references user_id
ALTER TABLE alpha_raw.wallet_token_snapshots
DROP CONSTRAINT IF EXISTS wallet_token_snapshots_user_id_user_wallet_address_fkey;

-- Step 2: Drop existing unique constraint
ALTER TABLE alpha_raw.wallet_token_snapshots
DROP CONSTRAINT IF EXISTS wallet_token_snapshots_user_wallet_address_token_address_ch_key;

-- Step 3: Remove user_id column
ALTER TABLE alpha_raw.wallet_token_snapshots
DROP COLUMN IF EXISTS user_id;

-- Step 4: Add new unique constraint (without user_id)
-- This ensures one snapshot per (wallet, token, chain, date)
ALTER TABLE alpha_raw.wallet_token_snapshots
ADD CONSTRAINT wallet_token_snapshots_wallet_token_chain_date_unique
UNIQUE (user_wallet_address, token_address, chain, inserted_at);

-- Step 5: Add index for efficient JOINs with user_crypto_wallets
CREATE INDEX IF NOT EXISTS idx_wallet_token_snapshots_wallet_address
ON alpha_raw.wallet_token_snapshots(user_wallet_address);

-- Step 6: Add index for date-based queries
CREATE INDEX IF NOT EXISTS idx_wallet_token_snapshots_inserted_at
ON alpha_raw.wallet_token_snapshots(inserted_at);

-- Step 7: Update table comment
COMMENT ON TABLE alpha_raw.wallet_token_snapshots IS
'Wallet token balance snapshots from DeBank API. Wallet-centric model - to get user data, JOIN with user_crypto_wallets table.';

-- Rollback instructions (if needed):
-- 1. ALTER TABLE alpha_raw.wallet_token_snapshots ADD COLUMN user_id uuid NOT NULL;
-- 2. Add back foreign key constraint
-- 3. Update ETL processor to include user_id in inserts
