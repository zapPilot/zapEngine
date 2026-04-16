-- Migration: Create ETL Job Queue Table
-- Description: Persistent job queue for on-the-fly wallet data fetching
-- Part of: On-the-fly ETL Data Fetch feature

-- Create the etl_job_queue table
CREATE TABLE IF NOT EXISTS alpha_raw.etl_job_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type VARCHAR(50) NOT NULL CHECK (job_type IN ('wallet_onboarding', 'wallet_refresh')),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_address VARCHAR(42) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'rate_limited')),
    priority INTEGER NOT NULL DEFAULT 10,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    error_message TEXT,
    error_code VARCHAR(50),
    ip_address VARCHAR(45),
    user_agent TEXT,
    dedup_key VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique index: Only one pending/processing job per wallet at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_etl_jobs_unique_pending_wallet 
    ON alpha_raw.etl_job_queue (wallet_address) 
    WHERE status IN ('pending', 'processing');

-- Index for queue polling: Get pending jobs ordered by priority and scheduled time
CREATE INDEX IF NOT EXISTS idx_etl_jobs_pending 
    ON alpha_raw.etl_job_queue (status, priority DESC, scheduled_at ASC)
    WHERE status = 'pending';

-- Index for user-based rate limiting queries
CREATE INDEX IF NOT EXISTS idx_etl_jobs_user_rate_limit 
    ON alpha_raw.etl_job_queue (user_id, created_at DESC);

-- Index for IP-based rate limiting queries
CREATE INDEX IF NOT EXISTS idx_etl_jobs_ip_rate_limit 
    ON alpha_raw.etl_job_queue (ip_address, created_at DESC);

-- Index for deduplication queries
CREATE INDEX IF NOT EXISTS idx_etl_jobs_dedup 
    ON alpha_raw.etl_job_queue (dedup_key, created_at DESC);

-- Add comment for documentation
COMMENT ON TABLE alpha_raw.etl_job_queue IS 'Persistent job queue for on-the-fly ETL wallet data fetching with rate limiting';
