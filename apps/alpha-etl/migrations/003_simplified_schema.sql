-- Simplified schema for multi-source APR data integration
-- This schema supports multiple data sources where some have addresses (Pendle, Aave) 
-- and others don't (DeFiLlama uses internal UUIDs)

-- Drop existing table if it exists to start fresh
DROP TABLE IF EXISTS alpha_raw.pool_apr_snapshots CASCADE;

-- Create simplified pool_apr_snapshots table
CREATE TABLE alpha_raw.pool_apr_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  pool_address TEXT NULL, -- Nullable: DeFiLlama doesn't have real addresses
  protocol_address TEXT NULL, -- Nullable: DeFiLlama doesn't have real addresses  
  chain TEXT NOT NULL,
  protocol TEXT NOT NULL,
  symbol TEXT NOT NULL,
  symbols TEXT[] NULL,
  underlying_tokens TEXT[] NULL,
  tvl_usd NUMERIC NULL,
  apr NUMERIC NOT NULL,
  apr_base NUMERIC NULL,
  apr_reward NUMERIC NULL,
  volume_usd_1d NUMERIC NULL,
  exposure TEXT NULL, -- single, multi, stable
  reward_tokens TEXT[] NULL,
  pool_meta JSONB NULL,
  raw_data JSONB NULL, -- Store original API response for debugging
  source TEXT NOT NULL, -- defillama, pendle, aave, etc.
  snapshot_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  CONSTRAINT pool_apr_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT pool_apr_snapshots_unique_snapshot UNIQUE (
    pool_address,
    protocol_address, 
    chain,
    source,
    snapshot_time
  )
) TABLESPACE pg_default;

-- Create indexes for common queries
CREATE INDEX idx_pool_apr_snapshots_latest 
  ON alpha_raw.pool_apr_snapshots (chain, protocol, snapshot_time DESC);

CREATE INDEX idx_pool_apr_snapshots_tvl 
  ON alpha_raw.pool_apr_snapshots (tvl_usd DESC) 
  WHERE tvl_usd IS NOT NULL;

CREATE INDEX idx_pool_apr_snapshots_apr 
  ON alpha_raw.pool_apr_snapshots (apr DESC);

CREATE INDEX idx_pool_apr_snapshots_source_time 
  ON alpha_raw.pool_apr_snapshots (source, snapshot_time DESC);

CREATE INDEX idx_pool_apr_snapshots_symbols 
  ON alpha_raw.pool_apr_snapshots USING GIN (symbols);

-- Add comments for documentation
COMMENT ON TABLE alpha_raw.pool_apr_snapshots IS 'Multi-source APR data snapshots with nullable addresses for compatibility';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.pool_address IS 'Pool contract address (null for sources like DeFiLlama that use internal IDs)';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.protocol_address IS 'Protocol contract address (null for sources without real addresses)';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.source IS 'Data source: defillama, pendle, aave, etc.';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.symbols IS 'Array of individual token symbols parsed from composite symbol';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.raw_data IS 'Original API response for debugging and future field extraction';