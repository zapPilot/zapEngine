begin;

alter table from_fed_to_chain.episode_video_visuals
  add column if not exists failure_notified_at timestamptz;

-- Every retry path, including the older enqueue RPC, must make a future
-- terminal failure notify again. Centralize that invariant on the state
-- transition instead of requiring every caller to remember the new column.
create or replace function from_fed_to_chain.reset_episode_video_visual_failure_notification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'failed' and new.status <> 'failed' then
    new.failure_notified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reset_episode_video_visual_failure_notification
  on from_fed_to_chain.episode_video_visuals;
create trigger trg_reset_episode_video_visual_failure_notification
before update of status on from_fed_to_chain.episode_video_visuals
for each row
execute function from_fed_to_chain.reset_episode_video_visual_failure_notification();

-- Visual planning is a prerequisite for every language render. A terminal
-- visual failure therefore blocks the whole episode even though the downstream
-- episode_videos rows remain queued. Give it the same durable, at-least-once
-- Telegram notification contract as localized render failures.
create or replace function from_fed_to_chain.reap_failed_episode_video_visual_notifications(
  p_limit integer default 20
)
returns table (
  episode_id uuid,
  telegram_chat_id text,
  last_error text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select
    visual.episode_id,
    visual.telegram_chat_id,
    visual.last_error
  from from_fed_to_chain.episode_video_visuals visual
  where visual.status = 'failed'
    and visual.telegram_chat_id is not null
    and visual.failure_notified_at is null
  order by visual.updated_at
  limit greatest(coalesce(p_limit, 20), 1);
end;
$$;

create or replace function from_fed_to_chain.mark_episode_video_visual_failure_notified(
  p_episode_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_rows integer;
begin
  update from_fed_to_chain.episode_video_visuals visual
  set failure_notified_at = now(),
      updated_at = now()
  where visual.episode_id = p_episode_id
    and visual.status = 'failed'
    and visual.failure_notified_at is null;

  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end;
$$;

-- Narrow operator remediation for Control Center. This deliberately restarts
-- only the unfinished video checkpoints: translation, scripts, narration and
-- classroom audio are prerequisites and are never rewritten here.
create or replace function from_fed_to_chain.retry_episode_video_generation(
  p_episode_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  visual_record record;
  ready_languages integer;
begin
  select
    visual.status,
    visual.visual_hash,
    visual.visual_version,
    visual.source_hash,
    visual.lease_expires_at
  into visual_record
  from from_fed_to_chain.episode_video_visuals visual
  where visual.episode_id = p_episode_id
  for update;

  if not found then
    raise exception 'Episode has no video visual job'
      using errcode = '22023';
  end if;

  if visual_record.status = 'processing'
      and visual_record.lease_expires_at > now() then
    raise exception 'Episode video generation is currently processing'
      using errcode = '55000';
  end if;

  -- The UI applies the same guard for operator feedback, but correctness lives
  -- here: a service-role caller must not be able to clear a live ffmpeg/render
  -- lease underneath the worker.
  if exists (
    select 1
    from from_fed_to_chain.episode_videos video
    where video.episode_id = p_episode_id
      and video.status = 'processing'
      and video.lease_expires_at > now()
  ) then
    raise exception 'Episode video generation is currently processing'
      using errcode = '55000';
  end if;

  select count(distinct localization.language_code)
  into ready_languages
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

  if ready_languages <> 3 then
    raise exception 'Episode video retry requires completed zh-Hant, ja, and en audio prerequisites'
      using errcode = '22023';
  end if;

  -- A completed shared visual is a valid checkpoint. Keep it and every already
  -- completed language asset; only requeue unfinished localization renders.
  if visual_record.status = 'completed' then
    if visual_record.visual_hash is null then
      raise exception 'Completed episode visual is missing its checkpoint hash'
        using errcode = '23514';
    end if;

    if not exists (
      select 1
      from from_fed_to_chain.episode_videos video
      where video.episode_id = p_episode_id
        and video.status <> 'completed'
    ) then
      raise exception 'Episode video generation is already completed'
        using errcode = '22023';
    end if;

    update from_fed_to_chain.episode_videos video
    set status = 'queued',
        progress_percent = null,
        progress_stage = null,
        visual_hash = visual_record.visual_hash,
        visual_version = visual_record.visual_version,
        manifest = null,
        manifest_hash = null,
        renderer_version = null,
        storyboard_provider = null,
        storyboard_model = null,
        storyboard_prompt_version = null,
        script_hash = null,
        mp4_url = null,
        thumbnail_url = null,
        manifest_url = null,
        captions_ass_url = null,
        r2_prefix = null,
        duration_seconds = null,
        attempt_count = 0,
        next_attempt_at = now(),
        lease_owner = null,
        lease_expires_at = null,
        last_error = null,
        failure_notified_at = null,
        started_at = null,
        completed_at = null,
        updated_at = now()
    where video.episode_id = p_episode_id
      and video.status <> 'completed'
      and not (
        video.status = 'processing'
        and video.lease_expires_at > now()
      );

    -- A render can be claimed after the preflight check but before the update
    -- above. If that happens, keep the claim intact and abort the whole retry
    -- transaction instead of returning success after only partially requeueing
    -- the episode.
    if exists (
      select 1
      from from_fed_to_chain.episode_videos video
      where video.episode_id = p_episode_id
        and video.status = 'processing'
        and video.lease_expires_at > now()
    ) then
      raise exception 'Episode video generation is currently processing'
        using errcode = '55000';
    end if;

    return true;
  end if;

  -- An incomplete/failed shared visual cannot be reused. Clear downstream
  -- checkpoint references first because episode_videos has a foreign key to
  -- the visual checkpoint tuple, then requeue the shared visual itself.
  update from_fed_to_chain.episode_videos video
  set status = 'queued',
      progress_percent = null,
      progress_stage = null,
      visual_hash = null,
      visual_version = visual_record.visual_version,
      manifest = null,
      manifest_hash = null,
      renderer_version = null,
      storyboard_provider = null,
      storyboard_model = null,
      storyboard_prompt_version = null,
      script_hash = null,
      mp4_url = null,
      thumbnail_url = null,
      manifest_url = null,
      captions_ass_url = null,
      r2_prefix = null,
      duration_seconds = null,
      attempt_count = 0,
      next_attempt_at = now(),
      lease_owner = null,
      lease_expires_at = null,
      last_error = null,
      failure_notified_at = null,
      started_at = null,
      completed_at = null,
      updated_at = now()
  where video.episode_id = p_episode_id;

  update from_fed_to_chain.episode_video_visuals visual
  set status = 'queued',
      progress_percent = null,
      progress_stage = null,
      visual_payload = null,
      visual_hash = null,
      r2_prefix = null,
      attempt_count = 0,
      next_attempt_at = now(),
      lease_owner = null,
      lease_expires_at = null,
      last_error = null,
      failure_notified_at = null,
      started_at = null,
      completed_at = null,
      updated_at = now()
  where visual.episode_id = p_episode_id;

  return true;
end;
$$;

revoke execute on function from_fed_to_chain.reset_episode_video_visual_failure_notification()
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.reset_episode_video_visual_failure_notification()
  to service_role;

revoke execute on function from_fed_to_chain.reap_failed_episode_video_visual_notifications(integer)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.reap_failed_episode_video_visual_notifications(integer)
  to service_role;

revoke execute on function from_fed_to_chain.mark_episode_video_visual_failure_notified(uuid)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.mark_episode_video_visual_failure_notified(uuid)
  to service_role;

revoke execute on function from_fed_to_chain.retry_episode_video_generation(uuid)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.retry_episode_video_generation(uuid)
  to service_role;

notify pgrst, 'reload schema';

commit;
