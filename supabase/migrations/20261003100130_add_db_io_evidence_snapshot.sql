-- Read-only, bounded snapshots. Archive externally before a restart loses stats.
CREATE OR REPLACE FUNCTION from_fed_to_chain.capture_db_io_evidence()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '3s'
AS $$
  SELECT jsonb_build_object(
    'captured_at', clock_timestamp(),
    'postmaster_start', pg_postmaster_start_time(),
    'stats_reset', (SELECT stats_reset FROM extensions.pg_stat_statements_info),
    'database', (SELECT to_jsonb(d) - 'datname' FROM pg_catalog.pg_stat_database d WHERE datname = current_database()),
    'bgwriter', (SELECT to_jsonb(b) FROM pg_catalog.pg_stat_bgwriter b),
    'wal', (SELECT to_jsonb(w) FROM pg_catalog.pg_stat_wal w),
    'queries', COALESCE((
      SELECT jsonb_agg(to_jsonb(q)) FROM (
        SELECT queryid::text AS queryid, md5(query) AS fingerprint,
          left(query, 4000) AS normalized_query, calls::text AS calls,
          total_exec_time, shared_blks_hit::text AS shared_blks_hit,
          shared_blks_read::text AS shared_blks_read,
          shared_blks_dirtied::text AS shared_blks_dirtied,
          shared_blks_written::text AS shared_blks_written,
          temp_blks_read::text AS temp_blks_read,
          temp_blks_written::text AS temp_blks_written,
          blk_read_time, blk_write_time, wal_bytes::text AS wal_bytes
        FROM extensions.pg_stat_statements
        WHERE dbid = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database())
        ORDER BY shared_blks_read + shared_blks_written + temp_blks_read + temp_blks_written DESC, total_exec_time DESC
        LIMIT 30
      ) q
    ), '[]'::jsonb),
    'activity', COALESCE((
      SELECT jsonb_agg(to_jsonb(a)) FROM (
        SELECT pid, backend_type, state, wait_event_type, wait_event,
          query_id::text AS queryid,
          EXTRACT(epoch FROM clock_timestamp() - query_start) AS query_age_seconds,
          EXTRACT(epoch FROM clock_timestamp() - xact_start) AS transaction_age_seconds,
          pg_blocking_pids(pid) AS blocking_pids
        FROM pg_catalog.pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid()
        ORDER BY query_start ASC NULLS LAST
        LIMIT 60
      ) a
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION from_fed_to_chain.capture_db_io_evidence() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION from_fed_to_chain.capture_db_io_evidence() TO service_role;
