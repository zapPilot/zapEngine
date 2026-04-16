-- Remove unique constraint from portfolio_item_snapshots
-- Allows pure time-series data with snapshot_at timestamps
-- Trusts DeBank data quality to not send duplicates

BEGIN;

-- Drop the unique constraint
ALTER TABLE public.portfolio_item_snapshots
DROP CONSTRAINT IF EXISTS portfolio_item_snapshots_unique;

-- Add regular index for query performance (non-unique)
CREATE INDEX IF NOT EXISTS idx_portfolio_item_snapshots_lookup
ON public.portfolio_item_snapshots (wallet, chain, id_raw, snapshot_at, name_item);

-- Add comment explaining the change
COMMENT ON TABLE public.portfolio_item_snapshots IS
'Portfolio item snapshots. No unique constraint - allows true time-series data with multiple snapshots per day. DeBank data is trusted to be clean and non-duplicated.';

COMMIT;
