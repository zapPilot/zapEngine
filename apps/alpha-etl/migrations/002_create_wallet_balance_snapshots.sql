-- Wallet Balance Snapshots table for storing historical user wallet balance data

CREATE TABLE IF NOT EXISTS wallet_token_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  user_wallet_address TEXT NOT NULL,
  chain TEXT NOT NULL,
  token_address TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT,
  decimals INTEGER DEFAULT 18,
  raw_amount TEXT NOT NULL, -- Raw balance as string to handle large numbers
  amount NUMERIC NOT NULL, -- Formatted balance with decimals applied
  price_usd NUMERIC,
  value_usd NUMERIC, -- amount * price_usd
  token_meta JSONB, -- Token metadata (logo, description, etc.)
  raw_data JSONB, -- Original API response for debugging
  source TEXT NOT NULL DEFAULT 'debank',
  snapshot_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Composite unique constraint to prevent duplicates
  UNIQUE(user_id, user_wallet_address, chain, token_address, source, snapshot_time)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_wallet_balance_user_latest
  ON wallet_token_snapshots(user_id, snapshot_time DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_balance_wallet_latest
  ON wallet_token_snapshots(user_wallet_address, snapshot_time DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_balance_chain_token
  ON wallet_token_snapshots(chain, token_address);

CREATE INDEX IF NOT EXISTS idx_wallet_balance_value_usd
  ON wallet_token_snapshots(value_usd DESC)
  WHERE value_usd IS NOT NULL AND value_usd > 0;

CREATE INDEX IF NOT EXISTS idx_wallet_balance_source_time
  ON wallet_token_snapshots(source, snapshot_time DESC);

-- Partial index for non-zero balances (most common query)
CREATE INDEX IF NOT EXISTS idx_wallet_balance_nonzero
  ON wallet_token_snapshots(user_id, user_wallet_address, chain, snapshot_time DESC)
  WHERE amount > 0;

-- Comments for documentation
COMMENT ON TABLE wallet_token_snapshots IS 'Historical snapshots of VIP user wallet balances across all chains';
COMMENT ON COLUMN wallet_token_snapshots.user_id IS 'User ID from Supabase users table';
COMMENT ON COLUMN wallet_token_snapshots.user_wallet_address IS 'Ethereum-compatible wallet address';
COMMENT ON COLUMN wallet_token_snapshots.chain IS 'Blockchain network name (ethereum, arbitrum, polygon, etc.)';
COMMENT ON COLUMN wallet_token_snapshots.token_address IS 'Token contract address (0x0 for native tokens)';
COMMENT ON COLUMN wallet_token_snapshots.symbol IS 'Token symbol (ETH, USDC, etc.)';
COMMENT ON COLUMN wallet_token_snapshots.name IS 'Full token name';
COMMENT ON COLUMN wallet_token_snapshots.decimals IS 'Token decimal places';
COMMENT ON COLUMN wallet_token_snapshots.raw_amount IS 'Raw balance as returned by API (string for large numbers)';
COMMENT ON COLUMN wallet_token_snapshots.amount IS 'Human-readable balance with decimals applied';
COMMENT ON COLUMN wallet_token_snapshots.price_usd IS 'Token price in USD at snapshot time';
COMMENT ON COLUMN wallet_token_snapshots.value_usd IS 'Total USD value of token holding';
COMMENT ON COLUMN wallet_token_snapshots.token_meta IS 'Additional token metadata from API';
COMMENT ON COLUMN wallet_token_snapshots.raw_data IS 'Original API response data for debugging';
COMMENT ON COLUMN wallet_token_snapshots.source IS 'Data source (debank, etc.)';
COMMENT ON COLUMN wallet_token_snapshots.snapshot_time IS 'Timestamp when balance data was captured';

-- Function to get latest balances for a user
CREATE OR REPLACE FUNCTION get_latest_wallet_balances(p_user_id UUID, p_min_value_usd NUMERIC DEFAULT 1.0)
RETURNS TABLE (
  user_wallet_address TEXT,
  chain TEXT,
  token_address TEXT,
  symbol TEXT,
  amount NUMERIC,
  value_usd NUMERIC,
  snapshot_time TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (wbs.user_wallet_address, wbs.chain, wbs.token_address)
    wbs.user_wallet_address,
    wbs.chain,
    wbs.token_address,
    wbs.symbol,
    wbs.amount,
    wbs.value_usd,
    wbs.snapshot_time
  FROM wallet_token_snapshots wbs
  WHERE wbs.user_id = p_user_id
    AND wbs.amount > 0
    AND (wbs.value_usd IS NULL OR wbs.value_usd >= p_min_value_usd)
  ORDER BY wbs.user_wallet_address, wbs.chain, wbs.token_address, wbs.snapshot_time DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get portfolio summary for a user
CREATE OR REPLACE FUNCTION get_user_portfolio_summary(p_user_id UUID)
RETURNS TABLE (
  total_value_usd NUMERIC,
  wallet_count INTEGER,
  token_count INTEGER,
  chain_count INTEGER,
  last_updated TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  WITH latest_balances AS (
    SELECT DISTINCT ON (wbs.user_wallet_address, wbs.chain, wbs.token_address)
      wbs.user_wallet_address,
      wbs.chain,
      wbs.token_address,
      wbs.value_usd,
      wbs.snapshot_time
    FROM wallet_token_snapshots wbs
    WHERE wbs.user_id = p_user_id
      AND wbs.amount > 0
    ORDER BY wbs.user_wallet_address, wbs.chain, wbs.token_address, wbs.snapshot_time DESC
  )
  SELECT
    COALESCE(SUM(lb.value_usd), 0) as total_value_usd,
    COUNT(DISTINCT lb.user_wallet_address)::INTEGER as wallet_count,
    COUNT(DISTINCT lb.token_address)::INTEGER as token_count,
    COUNT(DISTINCT lb.chain)::INTEGER as chain_count,
    MAX(lb.snapshot_time) as last_updated
  FROM latest_balances lb;
END;
$$ LANGUAGE plpgsql;
