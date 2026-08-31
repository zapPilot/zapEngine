-- A composite-returning PL/pgSQL variable that was never assigned serializes
-- through PostgREST as an object whose every field is null. The application
-- expects a missed claim to be a real JSON null, matching claim_next's explicit
-- no-work path.
create or replace function from_fed_to_chain.claim_podcast_ingest_job(
  p_job_id uuid,
  p_owner text,
  p_lease_seconds integer default 120
)
returns from_fed_to_chain.podcast_ingest_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job from_fed_to_chain.podcast_ingest_jobs;
begin
  update from_fed_to_chain.podcast_ingest_jobs
  set
    status = 'processing',
    attempt_count = attempt_count + 1,
    lease_owner = p_owner,
    lease_expires_at = now() + make_interval(secs => greatest(p_lease_seconds, 30)),
    updated_at = now()
  where id = p_job_id
    and (
      status = 'queued'
      or (
        status = 'processing'
        and (lease_expires_at is null or lease_expires_at <= now())
      )
    )
  returning * into v_job;

  if v_job.id is null then
    return null;
  end if;

  return v_job;
end;
$$;
