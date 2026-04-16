-- Minimal test schema for testing schema dump application
-- This schema is intentionally simple to keep tests fast

CREATE TABLE IF NOT EXISTS test_users (
    id UUID PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS test_portfolio_snapshots (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES test_users(id),
    snapshot_date DATE NOT NULL,
    total_value NUMERIC(20, 8),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_user_date
ON test_portfolio_snapshots(user_id, snapshot_date);
