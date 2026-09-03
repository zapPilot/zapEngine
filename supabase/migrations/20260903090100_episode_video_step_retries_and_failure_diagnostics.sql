begin;

alter table from_fed_to_chain.episode_video_visuals
  add column if not exists checkpoint jsonb,
  add column if not exists last_failure_diagnostics jsonb;

alter table from_fed_to_chain.episode_video_visuals
  drop constraint if exists episode_video_visuals_checkpoint_object,
  drop constraint if exists episode_video_visuals_failure_diagnostics_object;
alter table from_fed_to_chain.episode_video_visuals
  add constraint episode_video_visuals_checkpoint_object check (
    checkpoint is null or (
      jsonb_typeof(checkpoint) = 'object'
      and octet_length(checkpoint::text) <= 524288
    )
  ),
  add constraint episode_video_visuals_failure_diagnostics_object check (
    last_failure_diagnostics is null or (
      jsonb_typeof(last_failure_diagnostics) = 'object'
      and octet_length(last_failure_diagnostics::text) <= 262144
    )
  );

create or replace function from_fed_to_chain.save_episode_video_visual_checkpoint(
  p_episode_id uuid,
  p_lease_owner text,
  p_checkpoint jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_rows integer;
begin
  if p_checkpoint is null or jsonb_typeof(p_checkpoint) <> 'object' then
    raise exception 'Visual checkpoint must be a JSON object'
      using errcode = '22023';
  end if;

  update from_fed_to_chain.episode_video_visuals visual
  set checkpoint = p_checkpoint,
      updated_at = now()
  where visual.episode_id = p_episode_id
    and visual.status = 'processing'
    and visual.lease_owner = p_lease_owner
    and visual.lease_expires_at > now();

  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end;
$$;

create or replace function from_fed_to_chain.record_episode_video_visual_failure_diagnostics(
  p_episode_id uuid,
  p_lease_owner text,
  p_diagnostics jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_rows integer;
begin
  if p_diagnostics is null or jsonb_typeof(p_diagnostics) <> 'object' then
    raise exception 'Visual failure diagnostics must be a JSON object'
      using errcode = '22023';
  end if;

  update from_fed_to_chain.episode_video_visuals visual
  set last_failure_diagnostics = p_diagnostics,
      updated_at = now()
  where visual.episode_id = p_episode_id
    and visual.status = 'processing'
    and visual.lease_owner = p_lease_owner
    and visual.lease_expires_at > now();

  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end;
$$;

-- PostgREST cannot resolve overloads that differ only by an optional named
-- argument. Replace the old signature in the same transaction.
drop function if exists from_fed_to_chain.retry_episode_video_generation(uuid, text);

create or replace function from_fed_to_chain.retry_episode_video_generation(
  p_episode_id uuid,
  p_visual_version text default null,
  p_force_replan boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  visual_record record;
  ready_languages integer;
  target_visual_version text;
  localization_record record;
begin
  target_visual_version := nullif(btrim(coalesce(p_visual_version, '')), '');

  select
    visual.status,
    visual.visual_hash,
    visual.visual_version,
    visual.source_hash,
    visual.lease_expires_at,
    visual.telegram_chat_id
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

  begin
    perform 1
    from from_fed_to_chain.episode_videos video
    where video.episode_id = p_episode_id
    order by video.episode_localization_id
    for update nowait;
  exception
    when lock_not_available then
      raise exception 'Episode video generation is currently processing'
        using errcode = '55000';
  end;

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

  -- Old episodes can have a completed shared visual and only a zh-Hant render.
  -- Materialize the missing ja/en rows before deciding whether work remains.
  for localization_record in
    select localization.id
    from from_fed_to_chain.episode_localizations localization
    where localization.episode_id = p_episode_id
      and localization.language_code in ('zh-Hant', 'ja', 'en')
      and localization.status = 'completed'
      and nullif(btrim(localization.script), '') is not null
      and nullif(btrim(localization.hls_url), '') is not null
      and (
        localization.language_code <> 'zh-Hant'
        or nullif(btrim(localization.classroom_hls_url), '') is not null
      )
  loop
    insert into from_fed_to_chain.episode_videos (
      episode_localization_id,
      episode_id,
      visual_hash,
      visual_version,
      telegram_chat_id
    ) values (
      localization_record.id,
      p_episode_id,
      case when visual_record.status = 'completed' then visual_record.visual_hash else null end,
      coalesce(target_visual_version, visual_record.visual_version),
      visual_record.telegram_chat_id
    )
    on conflict (episode_localization_id) do nothing;
  end loop;

  if not p_force_replan
      and visual_record.status = 'completed'
      and (
        target_visual_version is null
        or visual_record.visual_version = target_visual_version
      ) then
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

    if exists (
      select 1
      from from_fed_to_chain.episode_videos video
      where video.episode_id = p_episode_id
        and video.status not in ('completed', 'queued')
    ) then
      raise exception 'Episode video retry could not requeue every unfinished render'
        using errcode = '40001';
    end if;
    return true;
  end if;

  update from_fed_to_chain.episode_videos video
  set status = 'queued',
      progress_percent = null,
      progress_stage = null,
      visual_hash = null,
      visual_version = coalesce(target_visual_version, visual_record.visual_version),
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
      visual_version = coalesce(target_visual_version, visual.visual_version),
      r2_prefix = null,
      checkpoint = case
        when p_force_replan
          or (
            target_visual_version is not null
            and target_visual_version <> visual.visual_version
          ) then null
        else visual.checkpoint
      end,
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

  if exists (
    select 1 from from_fed_to_chain.episode_videos video
    where video.episode_id = p_episode_id and video.status <> 'queued'
  ) then
    raise exception 'Episode video retry could not requeue every render'
      using errcode = '40001';
  end if;

  return true;
end;
$$;

create or replace function from_fed_to_chain.clear_stale_episode_video_visual_checkpoint()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.visual_version is distinct from new.visual_version
      or old.source_hash is distinct from new.source_hash then
    new.checkpoint := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clear_stale_episode_video_visual_checkpoint
  on from_fed_to_chain.episode_video_visuals;
create trigger trg_clear_stale_episode_video_visual_checkpoint
before update of visual_version, source_hash on from_fed_to_chain.episode_video_visuals
for each row
execute function from_fed_to_chain.clear_stale_episode_video_visual_checkpoint();

create or replace function from_fed_to_chain.retry_episode_video_render(
  p_episode_id uuid,
  p_episode_localization_id uuid,
  p_visual_version text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  visual_record record;
  localization_record record;
  video_record record;
begin
  select visual.status, visual.visual_hash, visual.visual_version, visual.telegram_chat_id
  into visual_record
  from from_fed_to_chain.episode_video_visuals visual
  where visual.episode_id = p_episode_id
  for share;

  if not found
      or visual_record.status <> 'completed'
      or visual_record.visual_hash is null
      or visual_record.visual_version <> btrim(p_visual_version) then
    raise exception 'Visual checkpoint is not the current completed version; retry the whole episode video'
      using errcode = '22023';
  end if;

  select localization.id, localization.episode_id, localization.language_code,
         localization.status, localization.script, localization.hls_url,
         localization.classroom_hls_url
  into localization_record
  from from_fed_to_chain.episode_localizations localization
  where localization.id = p_episode_localization_id;

  if not found or localization_record.episode_id <> p_episode_id
      or localization_record.language_code not in ('zh-Hant', 'ja', 'en')
      or localization_record.status <> 'completed'
      or nullif(btrim(localization_record.script), '') is null
      or nullif(btrim(localization_record.hls_url), '') is null
      or (
        localization_record.language_code = 'zh-Hant'
        and nullif(btrim(localization_record.classroom_hls_url), '') is null
      ) then
    raise exception 'Episode render retry requires a completed renderable localization'
      using errcode = '22023';
  end if;

  insert into from_fed_to_chain.episode_videos (
    episode_localization_id, episode_id, visual_hash, visual_version, telegram_chat_id
  ) values (
    p_episode_localization_id, p_episode_id, visual_record.visual_hash,
    visual_record.visual_version, visual_record.telegram_chat_id
  ) on conflict (episode_localization_id) do nothing;

  begin
    select video.status, video.lease_expires_at
    into video_record
    from from_fed_to_chain.episode_videos video
    where video.episode_localization_id = p_episode_localization_id
      and video.episode_id = p_episode_id
    for update nowait;
  exception
    when lock_not_available then
      raise exception 'Episode video render is currently processing'
        using errcode = '55000';
  end;

  if not found then
    raise exception 'Episode render row does not belong to the episode'
      using errcode = '22023';
  end if;
  if video_record.status = 'processing' and video_record.lease_expires_at > now() then
    raise exception 'Episode video render is currently processing'
      using errcode = '55000';
  end if;
  if video_record.status = 'completed' then
    raise exception 'Episode video render is already completed'
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
  where video.episode_localization_id = p_episode_localization_id;

  return true;
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
      progress_percent = null,
      progress_stage = null,
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
    and video.lease_expires_at > now()
    and exists (
      select 1 from from_fed_to_chain.episode_video_visuals visual
      where visual.episode_id = video.episode_id
        and visual.status = 'completed'
        and visual.visual_hash = video.visual_hash
        and visual.visual_version = video.visual_version
    );
  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end;
$$;

create or replace function from_fed_to_chain.complete_episode_video_visual(
  p_episode_id uuid,
  p_lease_owner text,
  p_visual_payload jsonb,
  p_visual_hash text,
  p_visual_version text,
  p_source_hash text,
  p_r2_prefix text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_rows integer;
begin
  if p_visual_payload is null
      or jsonb_typeof(p_visual_payload) <> 'object'
      or nullif(btrim(p_visual_hash), '') is null
      or nullif(btrim(p_r2_prefix), '') is null then
    raise exception 'Completed episode video visuals require payload, hash, and R2 prefix'
      using errcode = '22023';
  end if;

  update from_fed_to_chain.episode_video_visuals visual
  set status = 'completed',
      progress_percent = null,
      progress_stage = null,
      visual_payload = p_visual_payload,
      visual_hash = btrim(p_visual_hash),
      r2_prefix = btrim(p_r2_prefix),
      checkpoint = null,
      last_failure_diagnostics = null,
      lease_owner = null,
      lease_expires_at = null,
      last_error = null,
      completed_at = now(),
      updated_at = now()
  where visual.episode_id = p_episode_id
    and visual.status = 'processing'
    and visual.lease_owner = p_lease_owner
    and visual.lease_expires_at > now()
    and visual.visual_version = btrim(p_visual_version)
    and visual.source_hash = btrim(p_source_hash);

  get diagnostics updated_rows = row_count;
  if updated_rows <> 1 then return false; end if;

  update from_fed_to_chain.episode_videos video
  set status = 'queued',
      progress_percent = null,
      progress_stage = null,
      visual_hash = btrim(p_visual_hash),
      visual_version = btrim(p_visual_version),
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
    and (
      video.visual_hash is distinct from btrim(p_visual_hash)
      or video.visual_version is distinct from btrim(p_visual_version)
    );

  return true;
end;
$$;

revoke execute on function from_fed_to_chain.save_episode_video_visual_checkpoint(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.save_episode_video_visual_checkpoint(uuid, text, jsonb)
  to service_role;
revoke execute on function from_fed_to_chain.record_episode_video_visual_failure_diagnostics(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.record_episode_video_visual_failure_diagnostics(uuid, text, jsonb)
  to service_role;
revoke execute on function from_fed_to_chain.retry_episode_video_generation(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.retry_episode_video_generation(uuid, text, boolean)
  to service_role;
revoke execute on function from_fed_to_chain.clear_stale_episode_video_visual_checkpoint()
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.clear_stale_episode_video_visual_checkpoint()
  to service_role;
revoke execute on function from_fed_to_chain.retry_episode_video_render(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.retry_episode_video_render(uuid, uuid, text)
  to service_role;
revoke execute on function from_fed_to_chain.complete_episode_video_visual(uuid, text, jsonb, text, text, text, text)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.complete_episode_video_visual(uuid, text, jsonb, text, text, text, text)
  to service_role;
revoke execute on function from_fed_to_chain.complete_episode_video(uuid, text, text, text, text, text, text, double precision)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.complete_episode_video(uuid, text, text, text, text, text, text, double precision)
  to service_role;

notify pgrst, 'reload schema';
commit;
