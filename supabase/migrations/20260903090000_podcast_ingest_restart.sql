begin;

alter table from_fed_to_chain.podcast_ingest_jobs
  alter column telegram_chat_id drop not null,
  add column if not exists failure_history jsonb not null default '[]'::jsonb;

alter table from_fed_to_chain.podcast_ingest_jobs
  drop constraint if exists podcast_ingest_jobs_failure_history_array;
alter table from_fed_to_chain.podcast_ingest_jobs
  add constraint podcast_ingest_jobs_failure_history_array
  check (jsonb_typeof(failure_history) = 'array');

create or replace function from_fed_to_chain.record_podcast_ingest_job_history()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  history_kind text;
  history_entry jsonb;
begin
  if old.status <> 'failed' and new.status = 'failed' then
    history_kind := 'failed';
  elsif old.status = 'processing'
      and new.status = 'processing'
      and old.lease_expires_at is not null
      and old.lease_expires_at <= now()
      and old.lease_owner is distinct from new.lease_owner then
    history_kind := 'lease_expired';
  elsif old.status in ('completed', 'failed') and new.status = 'queued' then
    history_kind := 'requeued';
  end if;

  if history_kind is null then
    return new;
  end if;

  history_entry := jsonb_build_object(
    'kind', history_kind,
    'at', now(),
    'attempt', new.attempt_count,
    'owner', coalesce(new.lease_owner, old.lease_owner),
    'error', coalesce(new.last_error, old.last_error)
  );

  new.failure_history := (
    select coalesce(jsonb_agg(entry order by position), '[]'::jsonb)
    from (
      select entry, position
      from jsonb_array_elements(
        coalesce(new.failure_history, old.failure_history, '[]'::jsonb) || history_entry
      ) with ordinality as item(entry, position)
      order by position desc
      limit 20
    ) newest
  );
  return new;
end;
$$;

drop trigger if exists trg_record_podcast_ingest_job_history
  on from_fed_to_chain.podcast_ingest_jobs;
create trigger trg_record_podcast_ingest_job_history
before update on from_fed_to_chain.podcast_ingest_jobs
for each row
execute function from_fed_to_chain.record_podcast_ingest_job_history();

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
    nullif(btrim(p_telegram_chat_id), '')
  )
  on conflict (source_url, language_code) do update
  set
    telegram_chat_id = coalesce(
      excluded.telegram_chat_id,
      from_fed_to_chain.podcast_ingest_jobs.telegram_chat_id
    ),
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

create or replace function from_fed_to_chain.restart_podcast_ingest(
  p_episode_id uuid,
  p_language_code text default 'zh-Hant'
)
returns from_fed_to_chain.podcast_ingest_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source_url text;
  v_ready_languages integer;
  v_existing from_fed_to_chain.podcast_ingest_jobs;
  v_job from_fed_to_chain.podcast_ingest_jobs;
  v_chat_id text;
begin
  if p_language_code not in ('zh-Hant', 'ja', 'en') then
    raise exception 'Unsupported podcast ingest language %', p_language_code
      using errcode = '22023';
  end if;

  select episode.source_url
  into v_source_url
  from from_fed_to_chain.episodes episode
  where episode.id = p_episode_id;

  if v_source_url is null then
    raise exception 'Episode does not exist'
      using errcode = '22023';
  end if;

  select count(distinct localization.language_code)
  into v_ready_languages
  from from_fed_to_chain.episode_localizations localization
  where localization.episode_id = p_episode_id
    and localization.language_code in ('zh-Hant', 'ja', 'en')
    and localization.status = 'completed'
    and nullif(btrim(localization.script), '') is not null
    and nullif(btrim(localization.hls_url), '') is not null
    and (
      localization.language_code <> 'zh-Hant'
      or nullif(btrim(localization.classroom_hls_url), '') is not null
    );

  if v_ready_languages = 3 then
    raise exception 'Episode audio is completed; retry video generation instead'
      using errcode = '22023';
  end if;

  begin
    select job.*
    into v_existing
    from from_fed_to_chain.podcast_ingest_jobs job
    where job.source_url = v_source_url
      and job.language_code = p_language_code
    for update nowait;
  exception
    when lock_not_available then
      raise exception 'Episode ingest is currently processing'
        using errcode = '55000';
  end;

  if v_existing.id is not null then
    if v_existing.status = 'queued' then
      return v_existing;
    end if;
    if v_existing.status = 'processing'
        and v_existing.lease_expires_at is not null
        and v_existing.lease_expires_at > now() then
      raise exception 'Episode ingest is currently processing'
        using errcode = '55000';
    end if;
    v_chat_id := v_existing.telegram_chat_id;
  end if;

  if v_chat_id is null then
    select job.telegram_chat_id
    into v_chat_id
    from from_fed_to_chain.podcast_ingest_jobs job
    where job.source_url = v_source_url
      and job.telegram_chat_id is not null
    order by job.updated_at desc, job.created_at desc
    limit 1;
  end if;

  if v_chat_id is null then
    select visual.telegram_chat_id
    into v_chat_id
    from from_fed_to_chain.episode_video_visuals visual
    where visual.episode_id = p_episode_id
      and visual.telegram_chat_id is not null
    limit 1;
  end if;

  if v_chat_id is null then
    select video.telegram_chat_id
    into v_chat_id
    from from_fed_to_chain.episode_videos video
    where video.episode_id = p_episode_id
      and video.telegram_chat_id is not null
    order by video.updated_at desc
    limit 1;
  end if;

  insert into from_fed_to_chain.podcast_ingest_jobs (
    source_url,
    language_code,
    telegram_chat_id,
    status
  ) values (
    v_source_url,
    p_language_code,
    v_chat_id,
    'queued'
  )
  on conflict (source_url, language_code) do update
  set status = 'queued',
      telegram_chat_id = coalesce(
        from_fed_to_chain.podcast_ingest_jobs.telegram_chat_id,
        excluded.telegram_chat_id
      ),
      lease_owner = null,
      lease_expires_at = null,
      last_error = null,
      updated_at = now()
  returning * into v_job;

  return v_job;
end;
$$;

-- Superseded by restart_podcast_ingest, which returns the durable job and
-- preserves/reconstructs notification ownership instead of returning a bool.
drop function if exists from_fed_to_chain.retry_episode_ingest(uuid);

revoke execute on function from_fed_to_chain.record_podcast_ingest_job_history()
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.record_podcast_ingest_job_history()
  to service_role;

revoke execute on function from_fed_to_chain.enqueue_podcast_ingest_job(text, text, text)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.enqueue_podcast_ingest_job(text, text, text)
  to service_role;

revoke execute on function from_fed_to_chain.restart_podcast_ingest(uuid, text)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.restart_podcast_ingest(uuid, text)
  to service_role;

notify pgrst, 'reload schema';
commit;
