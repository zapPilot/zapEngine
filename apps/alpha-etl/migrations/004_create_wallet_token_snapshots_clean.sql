-- Create wallet_token_snapshots table in alpha_raw schema
-- Based on current Supabase table structure

CREATE TABLE IF NOT EXISTS alpha_raw.wallet_token_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_wallet_address TEXT NOT NULL,
  token_address TEXT NOT NULL,
  chain TEXT NOT NULL,
  name TEXT,
  symbol TEXT,
  display_symbol TEXT,
  optimized_symbol TEXT,
  decimals INTEGER NOT NULL DEFAULT 18,
  logo_url TEXT,
  protocol_id TEXT,
  price NUMERIC,
  price_24h_change NUMERIC,
  is_verified BOOLEAN DEFAULT false,
  is_core BOOLEAN DEFAULT false,
  is_wallet BOOLEAN DEFAULT false,
  time_at BIGINT,
  inserted_at DATE NOT NULL DEFAULT CURRENT_DATE,
  total_supply NUMERIC,
  credit_score NUMERIC,
  amount NUMERIC,
  raw_amount NUMERIC,
  raw_amount_hex_str TEXT,
  
  CONSTRAINT wallet_token_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT wallet_token_snapshots_user_wallet_address_token_address_ch_key 
    UNIQUE (user_wallet_address, token_address, chain, inserted_at)
);

-- Add comments for documentation
COMMENT ON TABLE alpha_raw.wallet_token_snapshots IS 'Multi-chain wallet balance snapshots for user token holdings';
COMMENT ON COLUMN alpha_raw.wallet_token_snapshots.id IS 'Primary key UUID';
COMMENT ON COLUMN alpha_raw.wallet_token_snapshots.user_id IS 'Reference to user ID';
COMMENT ON COLUMN alpha_raw.wallet_token_snapshots.user_wallet_address IS 'Cryptocurrency wallet address';
COMMENT ON COLUMN alpha_raw.wallet_token_snapshots.token_address IS 'Token contract address';
COMMENT ON COLUMN alpha_raw.wallet_token_snapshots.chain IS 'Blockchain network identifier';
COMMENT ON COLUMN alpha_raw.wallet_token_snapshots.name IS 'Token name';
COMMENT ON COLUMN alpha_raw.wallet_token_snapshots.symbol IS 'Token symbol';
COMMENT ON COLUMN alpha_raw.wallet_token_snapshots.display_symbol IS 'Display token symbol';
COMMENT ON COLUMN alpha_raw.wallet_token_snapshots.optimized_symbol IS 'Optimized token symbol';
COMMENT ON COLUMN alpha_raw.wallet_token_snapshots.decimals IS 'Token decimal places';
COMMENT ON COLUMN alpha_raw.wallet_token_snapshots.logo_url IS 'Token logo URL';
COMMENT ON COLUMN alpha_raw.wallet_token_snapshots.protocol_id IS 'Protocol identifier';
COMMENT ON COLUMN alpha_raw.wallet_token_snapshots.price IS 'Token price';
COMMENT ON COLUMN alpha_raw.wallet_token_snapshots.price_24h_change IS '24-hour price change';
COMMENT ON COLUMN alpha_raw.wallet_token_snapshots.is_verified IS 'Whether token is verified';
COMMENT ON COLUMN alpha_raw.wallet_token_snapshots.is_core IS 'Whether token is core';
COMMENT ON COLUMN alpha_raw.wallet_token_snapshots.is_wallet IS 'Whether token is wallet-based';
COMMENT ON COLUMN alpha_raw.wallet_token_snapshots.time_at IS 'Timestamp for token data';
COMMENT ON COLUMN alpha_raw.wallet_token_snapshots.inserted_at IS 'Date when record was inserted';
COMMENT ON COLUMN alpha_raw.wallet_token_snapshots.total_supply IS 'Total token supply';
COMMENT ON COLUMN alpha_raw.wallet_token_snapshots.credit_score IS 'Token credit score';
COMMENT ON COLUMN alpha_raw.wallet_token_snapshots.amount IS 'Human-readable token amount';
COMMENT ON COLUMN alpha_raw.wallet_token_snapshots.raw_amount IS 'Raw token amount';
COMMENT ON COLUMN alpha_raw.wallet_token_snapshots.raw_amount_hex_str IS 'Raw amount as hex string';