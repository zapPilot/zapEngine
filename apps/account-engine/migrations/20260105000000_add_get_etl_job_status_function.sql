-- Migration: Add get_etl_job_status function
-- Date: 2026-01-05
-- Description: Expose ETL job status via public RPC without exposing alpha_raw schema

CREATE OR REPLACE FUNCTION public.get_etl_job_status(
    p_job_id UUID
)
RETURNS TABLE (
    job_id UUID,
    status VARCHAR(20),
    created_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        q.id AS job_id,
        q.status,
        q.created_at,
        q.completed_at,
        q.error_message
    FROM alpha_raw.etl_job_queue q
    WHERE q.id = p_job_id
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_etl_job_status IS
  'Fetch ETL job status by id without exposing alpha_raw schema';
