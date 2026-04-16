-- Migration: Remove IP-based rate limiting and tighten deduplication window
-- Description: Simplify rate limiting to user-based only and prevent rapid duplicate searches
-- Part of: Fix for duplicate ETL job creation bug

-- Drop the existing function
DROP FUNCTION IF EXISTS public.create_etl_job_for_wallet(UUID, VARCHAR, VARCHAR, VARCHAR, TEXT);

-- Recreate function without IP-based rate limiting and with tighter deduplication
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

    -- Rate limiting: 2 jobs/hour per user (only protection needed)
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

    -- Deduplication: Check if data was recently fetched (tightened to 5 minutes)
    SELECT q.id INTO v_existing_job_id
    FROM alpha_raw.etl_job_queue q
    WHERE q.dedup_key = v_dedup_key
      AND q.status = 'completed'
      AND q.completed_at > NOW() - INTERVAL '5 minutes'
    LIMIT 1;

    IF v_existing_job_id IS NOT NULL THEN
        RETURN QUERY SELECT
            v_existing_job_id,
            'completed'::VARCHAR(20),
            'Data recently fetched (within 5 minutes)'::TEXT,
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

-- Update function comment
COMMENT ON FUNCTION public.create_etl_job_for_wallet IS 'Creates ETL job with user-based rate limiting (2/hr per user) and 5-minute deduplication window';
