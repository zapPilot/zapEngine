begin;

create table from_fed_to_chain.episode_video_visuals (
  episode_id uuid primary key
    references from_fed_to_chain.episodes(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed')),
  visual_payload jsonb,
  visual_hash text,
  visual_version text not null,
  source_hash text not null,
  r2_prefix text,
  telegram_chat_id text,
  attempt_count integer not null default 0
    check (attempt_count >= 0 and attempt_count <= 3),
  next_attempt_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint episode_video_visuals_payload_is_object check (
    visual_payload is null or jsonb_typeof(visual_payload) = 'object'
  ),
  constraint episode_video_visuals_version_not_empty check (
    nullif(btrim(visual_version), '') is not null
  ),
  constraint episode_video_visuals_source_hash_not_empty check (
    nullif(btrim(source_hash), '') is not null
  ),
  constraint episode_video_visuals_processing_has_lease check (
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
  constraint episode_video_visuals_completed_has_payload check (
    status <> 'completed'
    or (
      visual_payload is not null
      and nullif(btrim(visual_hash), '') is not null
      and nullif(btrim(r2_prefix), '') is not null
      and completed_at is not null
    )
  ),
  constraint episode_video_visuals_checkpoint_key
    unique (episode_id, visual_hash, visual_version)
);

create index idx_episode_video_visuals_claim_queue
  on from_fed_to_chain.episode_video_visuals (next_attempt_at, created_at)
  where status = 'queued';

create index idx_episode_video_visuals_expired_leases
  on from_fed_to_chain.episode_video_visuals (lease_expires_at)
  where status = 'processing';

alter table from_fed_to_chain.episode_videos
  add column episode_id uuid,
  add column visual_hash text,
  add column visual_version text;

update from_fed_to_chain.episode_videos video
set episode_id = localization.episode_id
from from_fed_to_chain.episode_localizations localization
where localization.id = video.episode_localization_id;

insert into from_fed_to_chain.episode_video_visuals (
  episode_id,
  status,
  visual_payload,
  visual_hash,
  visual_version,
  source_hash,
  r2_prefix,
  attempt_count,
  next_attempt_at,
  started_at,
  completed_at,
  created_at,
  updated_at
)
select distinct on (localization.episode_id)
  localization.episode_id,
  case
    when video.status = 'completed' then 'completed'
    else 'queued'
  end,
  case
    when video.status = 'completed'
      then jsonb_build_object('legacyManifest', video.manifest)
    else null
  end,
  case
    when video.status = 'completed' then video.manifest_hash
    else null
  end,
  case
    when video.status = 'completed' then 'legacy-localized-manifest.v1'
    else 'podcast-image-visual-plan.v1'
  end,
  coalesce(
    nullif(btrim(video.script_hash), ''),
    encode(
      extensions.digest(coalesce(localization.script, ''), 'sha256'),
      'hex'
    )
  ),
  case
    when video.status = 'completed' then video.r2_prefix
    else null
  end,
  0,
  now(),
  case when video.status = 'completed' then video.started_at else null end,
  case when video.status = 'completed' then video.completed_at else null end,
  video.created_at,
  now()
from from_fed_to_chain.episode_videos video
join from_fed_to_chain.episode_localizations localization
  on localization.id = video.episode_localization_id
order by
  localization.episode_id,
  case when video.status = 'completed' then 0 else 1 end,
  video.updated_at desc;

update from_fed_to_chain.episode_videos video
set visual_hash = case
      when video.status = 'completed' then visual.visual_hash
      else null
    end,
    visual_version = visual.visual_version
from from_fed_to_chain.episode_video_visuals visual
where visual.episode_id = video.episode_id;

alter table from_fed_to_chain.episode_videos
  alter column episode_id set not null,
  alter column visual_version set not null,
  add constraint episode_videos_episode_fk
    foreign key (episode_id)
    references from_fed_to_chain.episodes(id) on delete cascade,
  add constraint episode_videos_visual_checkpoint_fk
    foreign key (episode_id, visual_hash, visual_version)
    references from_fed_to_chain.episode_video_visuals(
      episode_id,
      visual_hash,
      visual_version
    );

alter table from_fed_to_chain.episode_videos
  drop constraint episode_videos_completed_has_assets;

alter table from_fed_to_chain.episode_videos
  add constraint episode_videos_completed_has_assets check (
    status <> 'completed'
    or (
      nullif(btrim(visual_hash), '') is not null
      and nullif(btrim(visual_version), '') is not null
      and manifest is not null
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
  );

create index idx_episode_videos_visual_checkpoint
  on from_fed_to_chain.episode_videos (
    episode_id,
    visual_hash,
    visual_version
  );

create or replace function from_fed_to_chain.enqueue_episode_video_visual(
  p_episode_id uuid,
  p_visual_version text,
  p_source_hash text,
  p_telegram_chat_id text default null
)
returns setof from_fed_to_chain.episode_video_visuals
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
  current_visual_version text;
  current_source_hash text;
begin
  if nullif(btrim(p_visual_version), '') is null then
    raise exception 'p_visual_version must not be empty'
      using errcode = '22023';
  end if;
  if nullif(btrim(p_source_hash), '') is null then
    raise exception 'p_source_hash must not be empty'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from from_fed_to_chain.episode_localizations localization
    where localization.episode_id = p_episode_id
      and localization.language_code = 'zh-Hant'
      and localization.status = 'completed'
      and nullif(btrim(localization.script), '') is not null
      and nullif(btrim(localization.hls_url), '') is not null
      and nullif(btrim(localization.classroom_hls_url), '') is not null
  ) then
    raise exception 'Episode video visuals require completed zh-Hant script, main audio, and classroom audio'
      using errcode = '22023';
  end if;

  insert into from_fed_to_chain.episode_video_visuals (
    episode_id,
    visual_version,
    source_hash,
    telegram_chat_id
  )
  values (
    p_episode_id,
    btrim(p_visual_version),
    btrim(p_source_hash),
    nullif(btrim(p_telegram_chat_id), '')
  )
  on conflict (episode_id) do nothing;

  select visual.status, visual.visual_version, visual.source_hash
  into current_status, current_visual_version, current_source_hash
  from from_fed_to_chain.episode_video_visuals visual
  where visual.episode_id = p_episode_id
  for update;

  if current_status = 'failed'
      or current_visual_version is distinct from btrim(p_visual_version)
      or current_source_hash is distinct from btrim(p_source_hash) then
    update from_fed_to_chain.episode_videos video
    set status = 'queued',
        visual_hash = null,
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
    where video.episode_id = p_episode_id;

    update from_fed_to_chain.episode_video_visuals visual
    set status = 'queued',
        visual_payload = null,
        visual_hash = null,
        visual_version = btrim(p_visual_version),
        source_hash = btrim(p_source_hash),
        r2_prefix = null,
        telegram_chat_id = coalesce(
          nullif(btrim(p_telegram_chat_id), ''),
          visual.telegram_chat_id
        ),
        attempt_count = 0,
        next_attempt_at = now(),
        lease_owner = null,
        lease_expires_at = null,
        last_error = null,
        started_at = null,
        completed_at = null,
        updated_at = now()
    where visual.episode_id = p_episode_id;
  elsif current_status in ('queued', 'processing')
        and nullif(btrim(p_telegram_chat_id), '') is not null then
    update from_fed_to_chain.episode_video_visuals visual
    set telegram_chat_id = nullif(btrim(p_telegram_chat_id), ''),
        updated_at = now()
    where visual.episode_id = p_episode_id;
  end if;

  return query
  select visual.*
  from from_fed_to_chain.episode_video_visuals visual
  where visual.episode_id = p_episode_id;
end;
$$;

create or replace function from_fed_to_chain.claim_episode_video_visual(
  p_lease_owner text
)
returns setof from_fed_to_chain.episode_video_visuals
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(p_lease_owner), '') is null then
    raise exception 'p_lease_owner must not be empty'
      using errcode = '22023';
  end if;

  update from_fed_to_chain.episode_video_visuals visual
  set status = case
        when visual.attempt_count >= 3 then 'failed'
        else 'queued'
      end,
      next_attempt_at = case visual.attempt_count
        when 1 then now() + interval '1 minute'
        when 2 then now() + interval '5 minutes'
        else now()
      end,
      lease_owner = null,
      lease_expires_at = null,
      last_error = coalesce(visual.last_error, 'Worker lease expired'),
      updated_at = now()
  where visual.status = 'processing'
    and visual.lease_expires_at <= now();

  return query
  with candidate as (
    select visual.episode_id
    from from_fed_to_chain.episode_video_visuals visual
    where visual.status = 'queued'
      and visual.next_attempt_at <= now()
      and visual.attempt_count < 3
    order by visual.next_attempt_at, visual.created_at
    limit 1
    for update skip locked
  )
  update from_fed_to_chain.episode_video_visuals visual
  set status = 'processing',
      attempt_count = visual.attempt_count + 1,
      lease_owner = btrim(p_lease_owner),
      lease_expires_at = now() + interval '10 minutes',
      started_at = coalesce(visual.started_at, now()),
      updated_at = now()
  from candidate
  where visual.episode_id = candidate.episode_id
  returning visual.*;
end;
$$;

create or replace function from_fed_to_chain.renew_episode_video_visual_lease(
  p_episode_id uuid,
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
  update from_fed_to_chain.episode_video_visuals visual
  set lease_expires_at = now() + interval '10 minutes',
      updated_at = now()
  where visual.episode_id = p_episode_id
    and visual.status = 'processing'
    and visual.lease_owner = p_lease_owner
    and visual.lease_expires_at > now();

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
      visual_payload = p_visual_payload,
      visual_hash = btrim(p_visual_hash),
      r2_prefix = btrim(p_r2_prefix),
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
  if updated_rows <> 1 then
    return false;
  end if;

  update from_fed_to_chain.episode_videos video
  set status = 'queued',
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

create or replace function from_fed_to_chain.fail_episode_video_visual(
  p_episode_id uuid,
  p_lease_owner text,
  p_last_error text
)
returns setof from_fed_to_chain.episode_video_visuals
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update from_fed_to_chain.episode_video_visuals visual
  set status = case
        when visual.attempt_count >= 3 then 'failed'
        else 'queued'
      end,
      next_attempt_at = case visual.attempt_count
        when 1 then now() + interval '1 minute'
        when 2 then now() + interval '5 minutes'
        else now()
      end,
      lease_owner = null,
      lease_expires_at = null,
      last_error = left(
        coalesce(
          nullif(btrim(p_last_error), ''),
          'Unknown video visual worker error'
        ),
        4000
      ),
      updated_at = now()
  where visual.episode_id = p_episode_id
    and visual.status = 'processing'
    and visual.lease_owner = p_lease_owner
    and visual.lease_expires_at > now()
  returning visual.*;
end;
$$;

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
  localization_record record;
  visual_record record;
  current_status text;
  current_visual_hash text;
  current_visual_version text;
  target_visual_hash text;
begin
  select
    localization.episode_id,
    localization.language_code,
    localization.status,
    localization.script,
    localization.hls_url,
    localization.classroom_hls_url
  into localization_record
  from from_fed_to_chain.episode_localizations localization
  where localization.id = p_episode_localization_id;

  if localization_record is null
      or localization_record.language_code not in ('zh-Hant', 'ja', 'en')
      or localization_record.status <> 'completed'
      or nullif(btrim(localization_record.script), '') is null
      or nullif(btrim(localization_record.hls_url), '') is null
      or (
        localization_record.language_code = 'zh-Hant'
        and nullif(btrim(localization_record.classroom_hls_url), '') is null
      ) then
    raise exception 'Episode video jobs require completed zh-Hant, ja, or en audio (plus zh-Hant classroom audio)'
      using errcode = '22023';
  end if;

  select
    visual.status,
    visual.visual_hash,
    visual.visual_version
  into visual_record
  from from_fed_to_chain.episode_video_visuals visual
  where visual.episode_id = localization_record.episode_id
  for share;

  if visual_record is null then
    raise exception 'Episode video visual job must be enqueued first'
      using errcode = '22023';
  end if;

  target_visual_hash := case
    when visual_record.status = 'completed' then visual_record.visual_hash
    else null
  end;

  insert into from_fed_to_chain.episode_videos (
    episode_localization_id,
    episode_id,
    visual_hash,
    visual_version,
    telegram_chat_id
  )
  values (
    p_episode_localization_id,
    localization_record.episode_id,
    target_visual_hash,
    visual_record.visual_version,
    nullif(btrim(p_telegram_chat_id), '')
  )
  on conflict (episode_localization_id) do nothing;

  select video.status, video.visual_hash, video.visual_version
  into current_status, current_visual_hash, current_visual_version
  from from_fed_to_chain.episode_videos video
  where video.episode_localization_id = p_episode_localization_id
  for update;

  if current_status = 'failed'
      or current_visual_hash is distinct from target_visual_hash
      or current_visual_version is distinct from visual_record.visual_version
      or (
        current_status = 'completed'
        and visual_record.status <> 'completed'
      ) then
    update from_fed_to_chain.episode_videos video
    set status = 'queued',
        episode_id = localization_record.episode_id,
        visual_hash = target_visual_hash,
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
    join from_fed_to_chain.episode_video_visuals visual
      on visual.episode_id = video.episode_id
      and visual.visual_hash = video.visual_hash
      and visual.visual_version = video.visual_version
    join from_fed_to_chain.episode_localizations localization
      on localization.id = video.episode_localization_id
    where video.status = 'queued'
      and video.next_attempt_at <= now()
      and video.attempt_count < 3
      and visual.status = 'completed'
      and localization.language_code in ('zh-Hant', 'ja', 'en')
      and localization.status = 'completed'
      and nullif(btrim(localization.script), '') is not null
      and nullif(btrim(localization.hls_url), '') is not null
      and (
        localization.language_code <> 'zh-Hant'
        or nullif(btrim(localization.classroom_hls_url), '') is not null
      )
    order by video.next_attempt_at, video.created_at
    limit 1
    for update of video skip locked
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
    and video.lease_expires_at > now()
    and exists (
      select 1
      from from_fed_to_chain.episode_video_visuals visual
      where visual.episode_id = video.episode_id
        and visual.status = 'completed'
        and visual.visual_hash = video.visual_hash
        and visual.visual_version = video.visual_version
    );

  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
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
    and video.lease_expires_at > now()
    and exists (
      select 1
      from from_fed_to_chain.episode_video_visuals visual
      where visual.episode_id = video.episode_id
        and visual.status = 'completed'
        and visual.visual_hash = video.visual_hash
        and visual.visual_version = video.visual_version
    );

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
    and video.lease_expires_at > now()
    and exists (
      select 1
      from from_fed_to_chain.episode_video_visuals visual
      where visual.episode_id = video.episode_id
        and visual.status = 'completed'
        and visual.visual_hash = video.visual_hash
        and visual.visual_version = video.visual_version
    );

  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end;
$$;

alter table from_fed_to_chain.episode_video_visuals enable row level security;

create policy "Service role can manage episode video visuals"
  on from_fed_to_chain.episode_video_visuals for all to service_role
  using (true) with check (true);

grant all on from_fed_to_chain.episode_video_visuals to service_role;
revoke all on from_fed_to_chain.episode_video_visuals
  from public, anon, authenticated;

revoke execute on function from_fed_to_chain.enqueue_episode_video_visual(
  uuid,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function from_fed_to_chain.enqueue_episode_video_visual(
  uuid,
  text,
  text,
  text
) to service_role;

revoke execute on function from_fed_to_chain.claim_episode_video_visual(text)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.claim_episode_video_visual(text)
  to service_role;

revoke execute on function from_fed_to_chain.renew_episode_video_visual_lease(
  uuid,
  text
) from public, anon, authenticated;
grant execute on function from_fed_to_chain.renew_episode_video_visual_lease(
  uuid,
  text
) to service_role;

revoke execute on function from_fed_to_chain.complete_episode_video_visual(
  uuid,
  text,
  jsonb,
  text,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function from_fed_to_chain.complete_episode_video_visual(
  uuid,
  text,
  jsonb,
  text,
  text,
  text,
  text
) to service_role;

revoke execute on function from_fed_to_chain.fail_episode_video_visual(
  uuid,
  text,
  text
) from public, anon, authenticated;
grant execute on function from_fed_to_chain.fail_episode_video_visual(
  uuid,
  text,
  text
) to service_role;

notify pgrst, 'reload schema';

commit;
