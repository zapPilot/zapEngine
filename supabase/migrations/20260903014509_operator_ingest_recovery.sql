-- Control Center recovery jobs are durable ingest work but have no Telegram
-- recipient. Existing Telegram-created rows keep their chat id and behavior.
alter table from_fed_to_chain.podcast_ingest_jobs
  alter column telegram_chat_id drop not null;

create or replace function from_fed_to_chain.retry_episode_ingest(
  p_episode_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source_url text;
  v_job_id uuid;
  v_completed_audio integer;
begin
  select episode.source_url
  into v_source_url
  from from_fed_to_chain.episodes episode
  where episode.id = p_episode_id;

  if v_source_url is null then
    raise exception 'Episode does not exist'
      using errcode = '22023';
  end if;

  select count(*)
  into v_completed_audio
  from from_fed_to_chain.episode_localizations localization
  where localization.episode_id = p_episode_id
    and localization.language_code in ('zh-Hant', 'ja', 'en')
    and localization.status = 'completed'
    and nullif(btrim(localization.hls_url), '') is not null
    and (
      localization.language_code <> 'zh-Hant'
      or nullif(btrim(localization.classroom_hls_url), '') is not null
    );

  if v_completed_audio = 3 then
    raise exception 'Episode ingest is already completed'
      using errcode = '55000';
  end if;

  -- A queued job already expresses the requested recovery. Do not create a
  -- second language-keyed row for the same source URL.
  if exists (
    select 1
    from from_fed_to_chain.podcast_ingest_jobs job
    where job.source_url = v_source_url
      and job.status = 'queued'
  ) then
    return true;
  end if;

  -- Never steal a live worker lease. Expired processing rows are resumable and
  -- are intentionally eligible for the reset below.
  if exists (
    select 1
    from from_fed_to_chain.podcast_ingest_jobs job
    where job.source_url = v_source_url
      and job.status = 'processing'
      and job.lease_expires_at > now()
  ) then
    raise exception 'Episode ingest is currently processing'
      using errcode = '55000';
  end if;

  select job.id
  into v_job_id
  from from_fed_to_chain.podcast_ingest_jobs job
  where job.source_url = v_source_url
  order by job.updated_at desc, job.created_at desc
  for update
  limit 1;

  if v_job_id is not null then
    update from_fed_to_chain.podcast_ingest_jobs
    set
      status = 'queued',
      lease_owner = null,
      lease_expires_at = null,
      last_error = null,
      updated_at = now()
    where id = v_job_id;
    return true;
  end if;

  -- Legacy episodes from before durable ingest jobs have no notification
  -- target. The worker treats null as an operator-triggered silent recovery.
  insert into from_fed_to_chain.podcast_ingest_jobs (
    source_url,
    language_code,
    telegram_chat_id,
    status
  ) values (
    v_source_url,
    'zh-Hant',
    null,
    'queued'
  );

  return true;
end;
$$;

revoke execute on function from_fed_to_chain.retry_episode_ingest(uuid)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.retry_episode_ingest(uuid)
  to service_role;
