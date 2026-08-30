create table if not exists from_fed_to_chain.podcast_ingest_jobs (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  language_code text not null check (language_code in ('zh-Hant', 'ja', 'en')),
  telegram_chat_id text not null,
  status text not null default 'queued' check (
    status in ('queued', 'processing', 'completed', 'failed')
  ),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_url, language_code),
  constraint podcast_ingest_jobs_lease_pair check (
    (lease_owner is null and lease_expires_at is null)
    or (lease_owner is not null and lease_expires_at is not null)
  )
);

create index if not exists podcast_ingest_jobs_claim_idx
  on from_fed_to_chain.podcast_ingest_jobs (status, lease_expires_at, created_at);

alter table from_fed_to_chain.podcast_ingest_jobs enable row level security;

revoke all on from_fed_to_chain.podcast_ingest_jobs from public, anon, authenticated;
grant all on from_fed_to_chain.podcast_ingest_jobs to service_role;

create policy "Service role can manage podcast ingest jobs"
  on from_fed_to_chain.podcast_ingest_jobs
  for all
  to service_role
  using (true)
  with check (true);

create or replace function from_fed_to_chain.enqueue_podcast_ingest_job(
  p_source_url text,
  p_language_code text,
  p_telegram_chat_id text
)
returns from_fed_to_chain.podcast_ingest_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job from_fed_to_chain.podcast_ingest_jobs;
begin
  insert into from_fed_to_chain.podcast_ingest_jobs (
    source_url,
    language_code,
    telegram_chat_id
  ) values (
    p_source_url,
    p_language_code,
    p_telegram_chat_id
  )
  on conflict (source_url, language_code) do update
  set
    telegram_chat_id = excluded.telegram_chat_id,
    status = case
      when from_fed_to_chain.podcast_ingest_jobs.status in ('completed', 'failed')
        then 'queued'
      else from_fed_to_chain.podcast_ingest_jobs.status
    end,
    lease_owner = case
      when from_fed_to_chain.podcast_ingest_jobs.status in ('completed', 'failed')
        then null
      else from_fed_to_chain.podcast_ingest_jobs.lease_owner
    end,
    lease_expires_at = case
      when from_fed_to_chain.podcast_ingest_jobs.status in ('completed', 'failed')
        then null
      else from_fed_to_chain.podcast_ingest_jobs.lease_expires_at
    end,
    last_error = case
      when from_fed_to_chain.podcast_ingest_jobs.status in ('completed', 'failed')
        then null
      else from_fed_to_chain.podcast_ingest_jobs.last_error
    end,
    updated_at = now()
  returning * into v_job;

  return v_job;
end;
$$;

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
begin
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

revoke execute on function from_fed_to_chain.enqueue_podcast_ingest_job(text, text, text)
  from public, anon, authenticated;
revoke execute on function from_fed_to_chain.claim_podcast_ingest_job(uuid, text, integer)
  from public, anon, authenticated;
revoke execute on function from_fed_to_chain.claim_next_podcast_ingest_job(text, integer)
  from public, anon, authenticated;

grant execute on function from_fed_to_chain.enqueue_podcast_ingest_job(text, text, text)
  to service_role;
grant execute on function from_fed_to_chain.claim_podcast_ingest_job(uuid, text, integer)
  to service_role;
grant execute on function from_fed_to_chain.claim_next_podcast_ingest_job(text, integer)
  to service_role;
