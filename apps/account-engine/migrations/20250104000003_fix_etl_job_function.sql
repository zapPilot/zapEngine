-- Migration: Fix column ambiguity in create_etl_job_for_wallet function
-- Date: 2026-01-05
-- Issue: RETURN QUERY SELECT statements have ambiguous column references
-- Error: "column reference 'status' is ambiguous - could refer to PL/pgSQL variable or table column"
--
-- Solution: Add explicit column aliases (AS job_id, AS status, AS message, AS rate_limited)
-- to all RETURN QUERY SELECT statements to eliminate ambiguity
--
-- Apply this by running in Supabase SQL Editor or via psql:
-- psql <connection-string> -f scripts/fix_db_function.sql

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
        -- ✅ FIXED: Added explicit column aliases
        RETURN QUERY SELECT
            NULL::UUID AS job_id,
            'rate_limited'::VARCHAR(20) AS status,
            'Rate limit exceeded: Maximum 2 jobs per hour per user'::TEXT AS message,
            TRUE AS rate_limited;
        RETURN;
    END IF;

    -- Rate limiting (secondary): 3 jobs/hour per IP (backup for shared users)
    IF p_ip_address IS NOT NULL THEN
        SELECT COUNT(*) INTO v_recent_jobs_count
        FROM alpha_raw.etl_job_queue
        WHERE ip_address = p_ip_address
          AND created_at > NOW() - INTERVAL '1 hour';

        IF v_recent_jobs_count >= 3 THEN
            -- ✅ FIXED: Added explicit column aliases
            RETURN QUERY SELECT
                NULL::UUID AS job_id,
                'rate_limited'::VARCHAR(20) AS status,
                'Rate limit exceeded: Maximum 3 jobs per hour per IP'::TEXT AS message,
                TRUE AS rate_limited;
            RETURN;
        END IF;
    END IF;

    -- Check for existing pending/processing job for this wallet
    -- ✅ FIXED: Qualified table column reference to avoid ambiguity
    SELECT id INTO v_existing_job_id
    FROM alpha_raw.etl_job_queue
    WHERE wallet_address = p_wallet_address
      AND alpha_raw.etl_job_queue.status IN ('pending', 'processing')
    LIMIT 1;

    IF v_existing_job_id IS NOT NULL THEN
        -- ✅ FIXED: Added explicit column aliases
        RETURN QUERY SELECT
            v_existing_job_id AS job_id,
            'pending'::VARCHAR(20) AS status,
            'Job already queued'::TEXT AS message,
            FALSE AS rate_limited;
        RETURN;
    END IF;

    -- Deduplication: Check if data was recently fetched (within last hour)
    -- ✅ FIXED: Qualified table column reference to avoid ambiguity
    SELECT id INTO v_existing_job_id
    FROM alpha_raw.etl_job_queue
    WHERE dedup_key = v_dedup_key
      AND alpha_raw.etl_job_queue.status = 'completed'
      AND completed_at > NOW() - INTERVAL '1 hour'
    LIMIT 1;

    IF v_existing_job_id IS NOT NULL THEN
        -- ✅ FIXED: Added explicit column aliases
        RETURN QUERY SELECT
            v_existing_job_id AS job_id,
            'completed'::VARCHAR(20) AS status,
            'Data recently fetched'::TEXT AS message,
            FALSE AS rate_limited;
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

    -- ✅ FIXED: Added explicit column aliases
    RETURN QUERY SELECT
        v_job_id AS job_id,
        'pending'::VARCHAR(20) AS status,
        'ETL job created'::TEXT AS message,
        FALSE AS rate_limited;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verification query to test the function
-- SELECT * FROM create_etl_job_for_wallet(
--     'c4569938-56e7-4f16-a015-92963a063339'::UUID,
--     '0x7822164ac9cb76953af2c4e6405accbab0503f60',
--     'wallet_onboarding',
--     '127.0.0.1',
--     'test-agent'
-- );
