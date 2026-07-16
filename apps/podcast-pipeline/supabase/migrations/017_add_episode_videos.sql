begin;

create table if not exists from_fed_to_chain.episode_videos (
  episode_localization_id uuid primary key
    references from_fed_to_chain.episode_localizations(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed')),
  manifest jsonb,
  manifest_hash text,
  renderer_version text,
  storyboard_provider text,
  storyboard_model text,
  storyboard_prompt_version text,
  script_hash text,
  mp4_url text,
  thumbnail_url text,
  manifest_url text,
  captions_ass_url text,
  r2_prefix text,
  duration_seconds double precision,
  telegram_chat_id text,
  attempt_count integer not null default 0
    check (attempt_count >= 0 and attempt_count <= 3),
  next_attempt_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  failure_notified_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint episode_videos_manifest_is_object check (
    manifest is null or jsonb_typeof(manifest) = 'object'
  ),
  constraint episode_videos_processing_has_lease check (
    (
      status = 'processing'
      and attempt_count > 0
      and lease_owner is not null
      and btrim(lease_owner) <> ''
      and lease_expires_at is not null
    )
    or (
      status <> 'processing'
      and lease_owner is null
      and lease_expires_at is null
    )
  ),
  constraint episode_videos_completed_has_assets check (
    status <> 'completed'
    or (
      manifest is not null
      and nullif(btrim(manifest_hash), '') is not null
      and nullif(btrim(renderer_version), '') is not null
      and nullif(btrim(storyboard_provider), '') is not null
      and nullif(btrim(storyboard_prompt_version), '') is not null
      and nullif(btrim(script_hash), '') is not null
      and nullif(btrim(mp4_url), '') is not null
      and nullif(btrim(thumbnail_url), '') is not null
      and nullif(btrim(manifest_url), '') is not null
      and nullif(btrim(captions_ass_url), '') is not null
      and nullif(btrim(r2_prefix), '') is not null
      and duration_seconds is not null
      and duration_seconds > 0
      and completed_at is not null
    )
  )
);

create index if not exists idx_episode_videos_claim_queue
  on from_fed_to_chain.episode_videos (next_attempt_at, created_at)
  where status = 'queued';

create index if not exists idx_episode_videos_expired_leases
  on from_fed_to_chain.episode_videos (lease_expires_at)
  where status = 'processing';

create or replace function from_fed_to_chain.enqueue_episode_video(
  p_episode_localization_id uuid,
  p_telegram_chat_id text default null
)
returns setof from_fed_to_chain.episode_videos
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
begin
  if not exists (
    select 1
    from from_fed_to_chain.episode_localizations localization
    where localization.id = p_episode_localization_id
      and localization.language_code = 'zh-Hant'
      and localization.status = 'completed'
      and localization.hls_url <> ''
  ) then
    raise exception 'Episode video jobs require a completed zh-Hant localization'
      using errcode = '22023';
  end if;

  insert into from_fed_to_chain.episode_videos (
    episode_localization_id,
    telegram_chat_id
  )
  values (
    p_episode_localization_id,
    nullif(btrim(p_telegram_chat_id), '')
  )
  on conflict (episode_localization_id) do nothing;

  select video.status
  into current_status
  from from_fed_to_chain.episode_videos video
  where video.episode_localization_id = p_episode_localization_id
  for update;

  if current_status = 'failed' then
    update from_fed_to_chain.episode_videos video
    set status = 'queued',
        telegram_chat_id = coalesce(
          nullif(btrim(p_telegram_chat_id), ''),
          video.telegram_chat_id
        ),
        attempt_count = 0,
        next_attempt_at = now(),
        lease_owner = null,
        lease_expires_at = null,
        last_error = null,
        failure_notified_at = null,
        started_at = null,
        completed_at = null,
        updated_at = now()
    where video.episode_localization_id = p_episode_localization_id;
  elsif current_status in ('queued', 'processing')
        and nullif(btrim(p_telegram_chat_id), '') is not null then
    update from_fed_to_chain.episode_videos video
    set telegram_chat_id = nullif(btrim(p_telegram_chat_id), ''),
        updated_at = now()
    where video.episode_localization_id = p_episode_localization_id;
  end if;

  return query
  select video.*
  from from_fed_to_chain.episode_videos video
  where video.episode_localization_id = p_episode_localization_id;
end;
$$;

create or replace function from_fed_to_chain.claim_episode_video(
  p_lease_owner text
)
returns setof from_fed_to_chain.episode_videos
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(p_lease_owner), '') is null then
    raise exception 'p_lease_owner must not be empty'
      using errcode = '22023';
  end if;

  -- Treat an expired lease as a failed attempt before selecting new work.
  -- This keeps crash recovery on the same 1 minute / 5 minute / terminal
  -- retry schedule as explicit worker failures.
  update from_fed_to_chain.episode_videos video
  set status = case
        when video.attempt_count >= 3 then 'failed'
        else 'queued'
      end,
      next_attempt_at = case video.attempt_count
        when 1 then now() + interval '1 minute'
        when 2 then now() + interval '5 minutes'
        else now()
      end,
      lease_owner = null,
      lease_expires_at = null,
      last_error = coalesce(video.last_error, 'Worker lease expired'),
      updated_at = now()
  where video.status = 'processing'
    and video.lease_expires_at <= now();

  return query
  with candidate as (
    select video.episode_localization_id
    from from_fed_to_chain.episode_videos video
    where video.status = 'queued'
      and video.next_attempt_at <= now()
      and video.attempt_count < 3
    order by video.next_attempt_at, video.created_at
    limit 1
    for update skip locked
  )
  update from_fed_to_chain.episode_videos video
  set status = 'processing',
      attempt_count = video.attempt_count + 1,
      lease_owner = btrim(p_lease_owner),
      lease_expires_at = now() + interval '10 minutes',
      started_at = coalesce(video.started_at, now()),
      updated_at = now()
  from candidate
  where video.episode_localization_id = candidate.episode_localization_id
  returning video.*;
end;
$$;

create or replace function from_fed_to_chain.renew_episode_video_lease(
  p_episode_localization_id uuid,
  p_lease_owner text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_rows integer;
begin
  update from_fed_to_chain.episode_videos video
  set lease_expires_at = now() + interval '10 minutes',
      updated_at = now()
  where video.episode_localization_id = p_episode_localization_id
    and video.status = 'processing'
    and video.lease_owner = p_lease_owner
    and video.lease_expires_at > now();

  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end;
$$;

create or replace function from_fed_to_chain.save_episode_video_manifest(
  p_episode_localization_id uuid,
  p_lease_owner text,
  p_manifest jsonb,
  p_manifest_hash text,
  p_renderer_version text,
  p_storyboard_provider text,
  p_storyboard_model text,
  p_storyboard_prompt_version text,
  p_script_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_rows integer;
begin
  update from_fed_to_chain.episode_videos video
  set manifest = p_manifest,
      manifest_hash = p_manifest_hash,
      renderer_version = p_renderer_version,
      storyboard_provider = p_storyboard_provider,
      storyboard_model = p_storyboard_model,
      storyboard_prompt_version = p_storyboard_prompt_version,
      script_hash = p_script_hash,
      updated_at = now()
  where video.episode_localization_id = p_episode_localization_id
    and video.status = 'processing'
    and video.lease_owner = p_lease_owner
    and video.lease_expires_at > now();

  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end;
$$;

create or replace function from_fed_to_chain.complete_episode_video(
  p_episode_localization_id uuid,
  p_lease_owner text,
  p_mp4_url text,
  p_thumbnail_url text,
  p_manifest_url text,
  p_captions_ass_url text,
  p_r2_prefix text,
  p_duration_seconds double precision
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_rows integer;
begin
  update from_fed_to_chain.episode_videos video
  set status = 'completed',
      mp4_url = p_mp4_url,
      thumbnail_url = p_thumbnail_url,
      manifest_url = p_manifest_url,
      captions_ass_url = p_captions_ass_url,
      r2_prefix = p_r2_prefix,
      duration_seconds = p_duration_seconds,
      lease_owner = null,
      lease_expires_at = null,
      last_error = null,
      completed_at = now(),
      updated_at = now()
  where video.episode_localization_id = p_episode_localization_id
    and video.status = 'processing'
    and video.lease_owner = p_lease_owner
    and video.lease_expires_at > now();

  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end;
$$;

create or replace function from_fed_to_chain.fail_episode_video(
  p_episode_localization_id uuid,
  p_lease_owner text,
  p_last_error text
)
returns setof from_fed_to_chain.episode_videos
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update from_fed_to_chain.episode_videos video
  set status = case
        when video.attempt_count >= 3 then 'failed'
        else 'queued'
      end,
      next_attempt_at = case video.attempt_count
        when 1 then now() + interval '1 minute'
        when 2 then now() + interval '5 minutes'
        else now()
      end,
      lease_owner = null,
      lease_expires_at = null,
      last_error = left(
        coalesce(nullif(btrim(p_last_error), ''), 'Unknown video worker error'),
        4000
      ),
      updated_at = now()
  where video.episode_localization_id = p_episode_localization_id
    and video.status = 'processing'
    and video.lease_owner = p_lease_owner
    and video.lease_expires_at > now()
  returning video.*;
end;
$$;

-- Terminal failures reach 'failed' from several paths: an explicit worker
-- fail, a worker that could not even load its source, and crash recovery where
-- an expired lease is reaped inside claim_episode_video. None of those paths
-- own a live Telegram context, so the worker sweeps the not-yet-notified
-- failures here. This SELECT does NOT stamp; the worker calls
-- mark_episode_video_failure_notified only after a confirmed send so a swallowed
-- send or mid-batch shutdown re-notifies on a later poll (at-least-once).
create or replace function from_fed_to_chain.reap_failed_episode_video_notifications(
  p_limit integer default 20
)
returns table (
  episode_localization_id uuid,
  telegram_chat_id text,
  episode_id uuid,
  last_error text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select
    video.episode_localization_id,
    video.telegram_chat_id,
    localization.episode_id,
    video.last_error
  from from_fed_to_chain.episode_videos video
  join from_fed_to_chain.episode_localizations localization
    on localization.id = video.episode_localization_id
  where video.status = 'failed'
    and video.telegram_chat_id is not null
    and video.failure_notified_at is null
  order by video.updated_at
  limit greatest(coalesce(p_limit, 20), 1);
end;
$$;

-- Stamp a terminal failure as notified. Idempotent: a second call after the
-- row is already stamped (or no longer 'failed') updates nothing and returns
-- false, so at-most one notification is recorded per failure episode.
create or replace function from_fed_to_chain.mark_episode_video_failure_notified(
  p_episode_localization_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_rows integer;
begin
  update from_fed_to_chain.episode_videos video
  set failure_notified_at = now(),
      updated_at = now()
  where video.episode_localization_id = p_episode_localization_id
    and video.status = 'failed'
    and video.failure_notified_at is null;

  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end;
$$;

alter table from_fed_to_chain.episode_videos enable row level security;

drop policy if exists "Service role can manage episode videos"
  on from_fed_to_chain.episode_videos;
create policy "Service role can manage episode videos"
  on from_fed_to_chain.episode_videos for all to service_role
  using (true) with check (true);

grant usage on schema from_fed_to_chain to service_role;

revoke all on from_fed_to_chain.episode_videos
  from public, anon, authenticated;
grant all on from_fed_to_chain.episode_videos to service_role;

revoke execute on function from_fed_to_chain.enqueue_episode_video(uuid, text)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.enqueue_episode_video(uuid, text)
  to service_role;

revoke execute on function from_fed_to_chain.claim_episode_video(text)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.claim_episode_video(text)
  to service_role;

revoke execute on function from_fed_to_chain.renew_episode_video_lease(uuid, text)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.renew_episode_video_lease(uuid, text)
  to service_role;

revoke execute on function from_fed_to_chain.save_episode_video_manifest(
  uuid,
  text,
  jsonb,
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function from_fed_to_chain.save_episode_video_manifest(
  uuid,
  text,
  jsonb,
  text,
  text,
  text,
  text,
  text,
  text
) to service_role;

revoke execute on function from_fed_to_chain.complete_episode_video(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  double precision
) from public, anon, authenticated;
grant execute on function from_fed_to_chain.complete_episode_video(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  double precision
) to service_role;

revoke execute on function from_fed_to_chain.fail_episode_video(uuid, text, text)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.fail_episode_video(uuid, text, text)
  to service_role;

revoke execute on function from_fed_to_chain.reap_failed_episode_video_notifications(integer)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.reap_failed_episode_video_notifications(integer)
  to service_role;

revoke execute on function from_fed_to_chain.mark_episode_video_failure_notified(uuid)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.mark_episode_video_failure_notified(uuid)
  to service_role;

notify pgrst, 'reload schema';

commit;
