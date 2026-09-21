-- Bound podcast ingest concurrency globally so a burst of Telegram URLs stays
-- durable in Postgres instead of becoming unbounded in-process work. The Node
-- pump uses the same capacity; the advisory lock makes the limit hold across
-- overlapping Fly app machines during deploys/restarts.
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
  v_active_jobs integer;
  v_capacity constant integer := 3;
begin
  perform pg_advisory_xact_lock(
    hashtext('from_fed_to_chain.podcast_ingest_jobs'),
    v_capacity
  );

  select count(*)
  into v_active_jobs
  from from_fed_to_chain.podcast_ingest_jobs
  where status = 'processing'
    and (lease_expires_at is null or lease_expires_at > now());

  if v_active_jobs >= v_capacity then
    return null;
  end if;

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

create or replace function from_fed_to_chain.claim_next_podcast_ingest_job(
  p_owner text,
  p_lease_seconds integer default 120
)
returns from_fed_to_chain.podcast_ingest_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job_id uuid;
  v_job from_fed_to_chain.podcast_ingest_jobs;
  v_active_jobs integer;
  v_capacity constant integer := 3;
begin
  perform pg_advisory_xact_lock(
    hashtext('from_fed_to_chain.podcast_ingest_jobs'),
    v_capacity
  );

  select count(*)
  into v_active_jobs
  from from_fed_to_chain.podcast_ingest_jobs
  where status = 'processing'
    and (lease_expires_at is null or lease_expires_at > now());

  if v_active_jobs >= v_capacity then
    return null;
  end if;

  select id into v_job_id
  from from_fed_to_chain.podcast_ingest_jobs
  where status = 'queued'
     or (
       status = 'processing'
       and (lease_expires_at is null or lease_expires_at <= now())
     )
  order by created_at asc
  for update skip locked
  limit 1;

  if v_job_id is null then
    return null;
  end if;

  update from_fed_to_chain.podcast_ingest_jobs
  set
    status = 'processing',
    attempt_count = attempt_count + 1,
    lease_owner = p_owner,
    lease_expires_at = now() + make_interval(secs => greatest(p_lease_seconds, 30)),
    updated_at = now()
  where id = v_job_id
  returning * into v_job;

  return v_job;
end;
$$;

revoke execute on function from_fed_to_chain.claim_podcast_ingest_job(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.claim_podcast_ingest_job(uuid, text, integer)
  to service_role;

revoke execute on function from_fed_to_chain.claim_next_podcast_ingest_job(text, integer)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.claim_next_podcast_ingest_job(text, integer)
  to service_role;

notify pgrst, 'reload schema';
