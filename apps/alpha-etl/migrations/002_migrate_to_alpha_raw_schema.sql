-- Alpha-ETL Database Schema Migration
-- Migrate to alpha_raw schema with updated table structure

-- Create alpha_raw schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS alpha_raw;

-- Create the new pool_apr_snapshots table in alpha_raw schema
CREATE TABLE IF NOT EXISTS alpha_raw.pool_apr_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pool_address text NOT NULL,
  protocol_address text NOT NULL,
  chain text NOT NULL,
  protocol text NOT NULL,
  symbol text NOT NULL,
  tvl_usd numeric NULL,
  apy numeric NOT NULL,
  apy_base numeric NULL,
  apy_reward numeric NULL,
  apy_pct_1d numeric NULL,
  apy_pct_7d numeric NULL,
  apy_pct_30d numeric NULL,
  sharpe_30d numeric NULL,
  volume_usd_1d numeric NULL,
  il_risk text NULL,
  exposure text NULL,
  reward_tokens text[] NULL,
  predicted_class text NULL,
  predicted_probability numeric NULL,
  pool_meta jsonb NULL,
  raw_data jsonb NULL,
  source text NOT NULL,
  snapshot_time timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT pool_apr_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT pool_apr_snapshots_pool_address_protocol_address_chain_sour_key UNIQUE (
    pool_address,
    protocol_address,
    chain,
    source,
    snapshot_time
  )
) TABLESPACE pg_default;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_pool_latest_alpha ON alpha_raw.pool_apr_snapshots(pool_address, snapshot_time DESC);
CREATE INDEX IF NOT EXISTS idx_protocol_chain_alpha ON alpha_raw.pool_apr_snapshots(protocol, chain);
CREATE INDEX IF NOT EXISTS idx_source_time_alpha ON alpha_raw.pool_apr_snapshots(source, snapshot_time DESC);
CREATE INDEX IF NOT EXISTS idx_tvl_apy_alpha ON alpha_raw.pool_apr_snapshots(tvl_usd, apy) WHERE tvl_usd IS NOT NULL AND apy IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_protocol_address_alpha ON alpha_raw.pool_apr_snapshots(protocol_address);

-- Comments for documentation
COMMENT ON SCHEMA alpha_raw IS 'Raw data schema for Alpha-ETL pipeline';
COMMENT ON TABLE alpha_raw.pool_apr_snapshots IS 'Historical snapshots of DeFi pool APR data from various sources';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.id IS 'Unique UUID identifier for each snapshot record';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.pool_address IS 'Pool contract address or unique identifier';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.protocol_address IS 'Protocol contract address or identifier';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.chain IS 'Blockchain network name';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.protocol IS 'DeFi protocol name';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.symbol IS 'Token symbol(s) in the pool';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.tvl_usd IS 'Total Value Locked in USD';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.apy IS 'Annual Percentage Yield';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.apy_base IS 'Base APY (excluding rewards)';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.apy_reward IS 'Reward APY';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.apy_pct_1d IS '1-day APY percentage change';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.apy_pct_7d IS '7-day APY percentage change';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.apy_pct_30d IS '30-day APY percentage change';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.sharpe_30d IS '30-day Sharpe ratio';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.volume_usd_1d IS '24-hour trading volume in USD';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.il_risk IS 'Impermanent loss risk level';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.exposure IS 'Asset exposure type (single, multi, etc.)';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.reward_tokens IS 'Array of reward token symbols';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.predicted_class IS 'ML prediction class for pool performance';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.predicted_probability IS 'ML prediction probability score';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.pool_meta IS 'Additional pool metadata as JSONB';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.raw_data IS 'Original API response data for debugging';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.source IS 'Data source (defillama, pendle, aave, etc.)';
COMMENT ON COLUMN alpha_raw.pool_apr_snapshots.snapshot_time IS 'Timestamp when data was captured';