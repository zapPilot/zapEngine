-- Migration: Create ETL Job Helper Functions
-- Description: Database functions for job creation with rate limiting and queue polling
-- Part of: On-the-fly ETL Data Fetch feature

-- Function: Create ETL job with rate limiting and deduplication
-- Returns job info with rate_limited flag if limits exceeded
-- Placed in PUBLIC schema for RPC accessibility, accesses ALPHA_RAW tables via SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.create_etl_job_for_wallet(
    p_user_id UUID,
    p_wallet_address VARCHAR(42),
    p_job_type VARCHAR(50) DEFAULT 'wallet_onboarding',
    p_ip_address VARCHAR(45) DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS TABLE (
    job_id UUID,
    status VARCHAR(20),
    message TEXT,
    rate_limited BOOLEAN
) AS $$
DECLARE
    v_job_id UUID;
    v_dedup_key VARCHAR(200);
    v_recent_jobs_count INTEGER;
    v_existing_job_id UUID;
BEGIN
    -- Generate deduplication key (wallet + clock hour)
    v_dedup_key := p_wallet_address || '_' || TO_CHAR(NOW(), 'YYYY-MM-DD-HH24');

    -- Rate limiting Layer 2: 2 jobs/hour per user (primary limit)
    SELECT COUNT(*) INTO v_recent_jobs_count
    FROM alpha_raw.etl_job_queue
    WHERE user_id = p_user_id
      AND created_at > NOW() - INTERVAL '1 hour';

    IF v_recent_jobs_count >= 2 THEN
        RETURN QUERY SELECT
            NULL::UUID,
            'rate_limited'::VARCHAR(20),
            'Rate limit exceeded: Maximum 2 jobs per hour per user'::TEXT,
            TRUE;
        RETURN;
    END IF;

    -- Rate limiting (secondary): 3 jobs/hour per IP (backup for shared users)
    IF p_ip_address IS NOT NULL THEN
        SELECT COUNT(*) INTO v_recent_jobs_count
        FROM alpha_raw.etl_job_queue
        WHERE ip_address = p_ip_address
          AND created_at > NOW() - INTERVAL '1 hour';

        IF v_recent_jobs_count >= 3 THEN
            RETURN QUERY SELECT
                NULL::UUID,
                'rate_limited'::VARCHAR(20),
                'Rate limit exceeded: Maximum 3 jobs per hour per IP'::TEXT,
                TRUE;
            RETURN;
        END IF;
    END IF;

    -- Check for existing pending/processing job for this wallet
    SELECT q.id INTO v_existing_job_id
    FROM alpha_raw.etl_job_queue q
    WHERE q.wallet_address = p_wallet_address
      AND q.status IN ('pending', 'processing')
    LIMIT 1;

    IF v_existing_job_id IS NOT NULL THEN
        RETURN QUERY SELECT
            v_existing_job_id,
            'pending'::VARCHAR(20),
            'Job already queued'::TEXT,
            FALSE;
        RETURN;
    END IF;

    -- Deduplication: Check if data was recently fetched (within last hour)
    SELECT q.id INTO v_existing_job_id
    FROM alpha_raw.etl_job_queue q
    WHERE q.dedup_key = v_dedup_key
      AND q.status = 'completed'
      AND q.completed_at > NOW() - INTERVAL '1 hour'
    LIMIT 1;

    IF v_existing_job_id IS NOT NULL THEN
        RETURN QUERY SELECT
            v_existing_job_id,
            'completed'::VARCHAR(20),
            'Data recently fetched'::TEXT,
            FALSE;
        RETURN;
    END IF;

    -- Create new job
    INSERT INTO alpha_raw.etl_job_queue (
        job_type, user_id, wallet_address, status, priority,
        dedup_key, ip_address, user_agent
    ) VALUES (
        p_job_type, p_user_id, p_wallet_address, 'pending',
        CASE WHEN p_job_type = 'wallet_onboarding' THEN 10 ELSE 5 END,
        v_dedup_key, p_ip_address, p_user_agent
    )
    RETURNING id INTO v_job_id;

    RETURN QUERY SELECT
        v_job_id,
        'pending'::VARCHAR(20),
        'ETL job created'::TEXT,
        FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get next pending job with row lock for concurrent safety
-- Placed in PUBLIC schema for RPC accessibility
CREATE OR REPLACE FUNCTION public.get_next_etl_job()
RETURNS TABLE (
    id UUID,
    job_type VARCHAR(50),
    user_id UUID,
    wallet_address VARCHAR(42),
    status VARCHAR(20),
    retry_count INTEGER,
    max_retries INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        q.id, 
        q.job_type, 
        q.user_id, 
        q.wallet_address,
        q.status, 
        q.retry_count, 
        q.max_retries
    FROM alpha_raw.etl_job_queue q
    WHERE q.status = 'pending' AND q.scheduled_at <= NOW()
    ORDER BY q.priority DESC, q.scheduled_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON FUNCTION public.create_etl_job_for_wallet IS 'Creates ETL job with rate limiting (2/hr per user, 3/hr per IP) and deduplication';
COMMENT ON FUNCTION public.get_next_etl_job IS 'Gets next pending job with row lock for concurrent-safe polling';
