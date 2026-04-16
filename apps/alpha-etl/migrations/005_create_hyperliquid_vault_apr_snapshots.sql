-- Hyperliquid Vault APR Snapshots (Option A)
-- Stores daily APR snapshots for Hyperliquid HLP vaults and other vault products
-- Part of multi-source APR tracking strategy (alongside pool_apr_snapshots)

-- Ensure UUID generator is available (Supabase usually has this already)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS alpha_raw.hyperliquid_vault_apr_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source and identification
  source TEXT NOT NULL DEFAULT 'hyperliquid',
  vault_address TEXT NOT NULL,
  vault_name TEXT NOT NULL,
  leader_address TEXT NOT NULL,

  -- APR metrics (aligned with pool_apr_snapshots for consistency)
  apr NUMERIC NOT NULL,
  apr_base NUMERIC,
  apr_reward NUMERIC,

  -- Vault-specific metrics
  tvl_usd NUMERIC,
  total_followers INTEGER,
  leader_commission NUMERIC,
  leader_fraction NUMERIC,

  -- Vault status
  is_closed BOOLEAN DEFAULT false,
  allow_deposits BOOLEAN DEFAULT true,

  -- Metadata and debugging
  pool_meta JSONB,
  raw_data JSONB,

  -- Timestamp
  snapshot_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure no duplicate snapshots for same vault at same time
  CONSTRAINT unique_vault_snapshot UNIQUE (vault_address, snapshot_time)
);

-- Primary index for fetching latest APR per vault
-- Usage: SELECT * FROM alpha_raw.hyperliquid_vault_apr_snapshots WHERE vault_address = ? ORDER BY snapshot_time DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_hyperliquid_vault_apr_latest
  ON alpha_raw.hyperliquid_vault_apr_snapshots (vault_address, snapshot_time DESC);

-- Time-series analysis index
-- Usage: SELECT * FROM alpha_raw.hyperliquid_vault_apr_snapshots WHERE snapshot_time >= ? ORDER BY snapshot_time DESC
CREATE INDEX IF NOT EXISTS idx_hyperliquid_vault_apr_time
  ON alpha_raw.hyperliquid_vault_apr_snapshots (snapshot_time DESC);

-- Source-based queries (for multi-protocol APR aggregation)
CREATE INDEX IF NOT EXISTS idx_hyperliquid_vault_apr_source
  ON alpha_raw.hyperliquid_vault_apr_snapshots (source, snapshot_time DESC);

-- (Option A) BRIN index for efficient large time-range scans at low cost
-- Replaces the previous partial index that used NOW() (not immutable)
CREATE INDEX IF NOT EXISTS idx_hyperliquid_vault_apr_brin_time
  ON alpha_raw.hyperliquid_vault_apr_snapshots
  USING BRIN (snapshot_time);

-- Safety: remove the old partial index name if it exists anywhere (e.g., dev)
DROP INDEX IF EXISTS alpha_raw.idx_hyperliquid_vault_apr_recent;

-- Comments for documentation
COMMENT ON TABLE alpha_raw.hyperliquid_vault_apr_snapshots IS
  'Daily APR snapshots for Hyperliquid vault products (HLP and future vaults). Stores vault-level metrics separate from user positions in portfolio_item_snapshots.';

COMMENT ON COLUMN alpha_raw.hyperliquid_vault_apr_snapshots.source IS
  'Data source identifier, default "hyperliquid" for consistency with multi-source pattern';

COMMENT ON COLUMN alpha_raw.hyperliquid_vault_apr_snapshots.vault_address IS
  'Hyperliquid vault contract address (e.g., 0xdfc24b077bc1425ad1dea75bcb6f8158e10df303 for HLP)';

COMMENT ON COLUMN alpha_raw.hyperliquid_vault_apr_snapshots.vault_name IS
  'Human-readable vault name (e.g., "Hyperliquidity Provider (HLP)")';

COMMENT ON COLUMN alpha_raw.hyperliquid_vault_apr_snapshots.leader_address IS
  'Address of vault leader/manager who controls vault strategy';

COMMENT ON COLUMN alpha_raw.hyperliquid_vault_apr_snapshots.apr IS
  'Annual Percentage Rate as decimal (e.g., 1.015 = 101.5% APR)';

COMMENT ON COLUMN alpha_raw.hyperliquid_vault_apr_snapshots.apr_base IS
  'Base APR component excluding rewards (nullable, for consistency with pool_apr_snapshots)';

COMMENT ON COLUMN alpha_raw.hyperliquid_vault_apr_snapshots.apr_reward IS
  'Reward/incentive APR component (nullable, for consistency with pool_apr_snapshots)';

COMMENT ON COLUMN alpha_raw.hyperliquid_vault_apr_snapshots.tvl_usd IS
  'Total Value Locked in vault in USD (e.g., totalVlm from API)';

COMMENT ON COLUMN alpha_raw.hyperliquid_vault_apr_snapshots.total_followers IS
  'Number of users deposited in this vault';

COMMENT ON COLUMN alpha_raw.hyperliquid_vault_apr_snapshots.leader_commission IS
  'Commission rate charged by vault leader (e.g., 0.1 = 10%)';

COMMENT ON COLUMN alpha_raw.hyperliquid_vault_apr_snapshots.leader_fraction IS
  'Leader ownership fraction of vault';

COMMENT ON COLUMN alpha_raw.hyperliquid_vault_apr_snapshots.is_closed IS
  'Whether vault is closed/inactive';

COMMENT ON COLUMN alpha_raw.hyperliquid_vault_apr_snapshots.allow_deposits IS
  'Whether vault accepts new deposits';

COMMENT ON COLUMN alpha_raw.hyperliquid_vault_apr_snapshots.pool_meta IS
  'Additional vault metadata as JSONB (flexible for future fields)';

COMMENT ON COLUMN alpha_raw.hyperliquid_vault_apr_snapshots.raw_data IS
  'Full API response for debugging and future field extraction';

COMMENT ON COLUMN alpha_raw.hyperliquid_vault_apr_snapshots.snapshot_time IS
  'UTC timestamp when snapshot was captured';

-- Rollback instructions
-- To rollback this migration, run:
-- DROP INDEX IF EXISTS alpha_raw.idx_hyperliquid_vault_apr_brin_time;
-- DROP INDEX IF EXISTS alpha_raw.idx_hyperliquid_vault_apr_source;
-- DROP INDEX IF EXISTS alpha_raw.idx_hyperliquid_vault_apr_time;
-- DROP INDEX IF EXISTS alpha_raw.idx_hyperliquid_vault_apr_latest;
-- DROP TABLE IF EXISTS alpha_raw.hyperliquid_vault_apr_snapshots;