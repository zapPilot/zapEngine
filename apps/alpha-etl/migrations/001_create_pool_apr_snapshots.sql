-- Alpha-ETL Database Schema
-- Pool APR Snapshots table for storing historical DeFi pool data

CREATE TABLE IF NOT EXISTS pool_apr_snapshots (
  pool_id TEXT NOT NULL,
  chain TEXT NOT NULL,
  protocol TEXT NOT NULL,
  symbol TEXT,
  tvl_usd NUMERIC,
  apy NUMERIC,
  apy_base NUMERIC,
  apy_reward NUMERIC,
  volume_usd_1d NUMERIC,
  il_risk TEXT,
  exposure TEXT,
  stablecoin BOOLEAN DEFAULT false,
  mu NUMERIC,
  sigma NUMERIC,
  sharpe_30d NUMERIC,
  score NUMERIC,
  source TEXT NOT NULL,
  raw_data JSONB,
  snapshot_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pool_id, source, snapshot_time)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_pool_latest ON pool_apr_snapshots(pool_id, snapshot_time DESC);
CREATE INDEX IF NOT EXISTS idx_protocol_chain ON pool_apr_snapshots(protocol, chain);
CREATE INDEX IF NOT EXISTS idx_source_time ON pool_apr_snapshots(source, snapshot_time DESC);
CREATE INDEX IF NOT EXISTS idx_tvl_apy ON pool_apr_snapshots(tvl_usd, apy) WHERE tvl_usd IS NOT NULL AND apy IS NOT NULL;

-- Comments for documentation
COMMENT ON TABLE pool_apr_snapshots IS 'Historical snapshots of DeFi pool APR data from various sources';
COMMENT ON COLUMN pool_apr_snapshots.pool_id IS 'Unique identifier for the pool (format: protocol:identifier)';
COMMENT ON COLUMN pool_apr_snapshots.chain IS 'Blockchain network name';
COMMENT ON COLUMN pool_apr_snapshots.protocol IS 'DeFi protocol name';
COMMENT ON COLUMN pool_apr_snapshots.symbol IS 'Token symbol(s) in the pool';
COMMENT ON COLUMN pool_apr_snapshots.tvl_usd IS 'Total Value Locked in USD';
COMMENT ON COLUMN pool_apr_snapshots.apy IS 'Annual Percentage Yield';
COMMENT ON COLUMN pool_apr_snapshots.apy_base IS 'Base APY (excluding rewards)';
COMMENT ON COLUMN pool_apr_snapshots.apy_reward IS 'Reward APY';
COMMENT ON COLUMN pool_apr_snapshots.volume_usd_1d IS '24-hour trading volume in USD';
COMMENT ON COLUMN pool_apr_snapshots.il_risk IS 'Impermanent loss risk level';
COMMENT ON COLUMN pool_apr_snapshots.exposure IS 'Asset exposure type (single, multi, etc.)';
COMMENT ON COLUMN pool_apr_snapshots.stablecoin IS 'Whether the pool contains only stablecoins';
COMMENT ON COLUMN pool_apr_snapshots.mu IS 'Expected return (statistical)';
COMMENT ON COLUMN pool_apr_snapshots.sigma IS 'Volatility (statistical)';
COMMENT ON COLUMN pool_apr_snapshots.sharpe_30d IS '30-day Sharpe ratio';
COMMENT ON COLUMN pool_apr_snapshots.score IS 'Overall pool quality score';
COMMENT ON COLUMN pool_apr_snapshots.source IS 'Data source (defillama, pendle, aave, etc.)';
COMMENT ON COLUMN pool_apr_snapshots.raw_data IS 'Original API response data for debugging';
COMMENT ON COLUMN pool_apr_snapshots.snapshot_time IS 'Timestamp when data was captured';