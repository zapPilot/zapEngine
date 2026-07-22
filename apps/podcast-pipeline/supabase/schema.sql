create extension if not exists pgcrypto;
create schema if not exists from_fed_to_chain;
create schema if not exists from_fed_to_chain_private;

create table if not exists from_fed_to_chain.episodes (
  id uuid primary key default gen_random_uuid(),
  source_url text not null unique,
  source_title text,
  created_at timestamptz not null default now(),
  listened boolean not null default false
);

create index if not exists idx_episodes_created_at
  on from_fed_to_chain.episodes (created_at desc);

create index if not exists idx_episodes_created_at_id
  on from_fed_to_chain.episodes (created_at desc, id desc);

create table if not exists from_fed_to_chain.episode_localizations (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references from_fed_to_chain.episodes(id) on delete cascade,
  language_code text not null default 'zh-Hant'
    check (btrim(language_code) <> ''),
  title text not null,
  hls_url text not null default '',
  classroom_hls_url text,
  raw_text text,
  script text,
  llm_model text,
  llm_thinking_model text,
  llm_provider text,
  tts_language_code text,
  tts_voice_name text,
  r2_prefix text,
  classroom_r2_prefix text,
  language_classrooms_jsonb jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'scraped', 'script_generated', 'audio_generated', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint episode_localizations_canonical_completed_audio_check check (
    language_code <> 'zh-Hant'
    or status <> 'completed'
    or (
      nullif(btrim(hls_url), '') is not null
      and nullif(btrim(classroom_hls_url), '') is not null
    )
  ),
  unique (episode_id, language_code)
);

create table if not exists from_fed_to_chain.episode_video_visuals (
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

create table if not exists from_fed_to_chain.episode_videos (
  episode_localization_id uuid primary key
    references from_fed_to_chain.episode_localizations(id) on delete cascade,
  episode_id uuid not null
    references from_fed_to_chain.episodes(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed')),
  visual_hash text,
  visual_version text not null,
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
  ),
  constraint episode_videos_visual_checkpoint_fk
    foreign key (episode_id, visual_hash, visual_version)
    references from_fed_to_chain.episode_video_visuals(
      episode_id,
      visual_hash,
      visual_version
    )
);

create index if not exists idx_episode_localizations_language_created
  on from_fed_to_chain.episode_localizations (language_code, created_at desc, episode_id desc);

create index if not exists idx_episode_videos_claim_queue
  on from_fed_to_chain.episode_videos (next_attempt_at, created_at)
  where status = 'queued';

create index if not exists idx_episode_videos_expired_leases
  on from_fed_to_chain.episode_videos (lease_expires_at)
  where status = 'processing';

create index if not exists idx_episode_videos_visual_checkpoint
  on from_fed_to_chain.episode_videos (
    episode_id,
    visual_hash,
    visual_version
  );

create index if not exists idx_episode_video_visuals_claim_queue
  on from_fed_to_chain.episode_video_visuals (next_attempt_at, created_at)
  where status = 'queued';

create index if not exists idx_episode_video_visuals_expired_leases
  on from_fed_to_chain.episode_video_visuals (lease_expires_at)
  where status = 'processing';

create table if not exists from_fed_to_chain.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  device_id text unique,
  display_name text,
  created_at timestamptz default now()
);

create unique index if not exists idx_users_device_id_unique
  on from_fed_to_chain.users (device_id)
  where device_id is not null;

create table if not exists from_fed_to_chain.likes (
  user_id uuid references from_fed_to_chain.users(id) on delete cascade,
  episode_id uuid references from_fed_to_chain.episodes(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, episode_id)
);

create index if not exists idx_likes_episode
  on from_fed_to_chain.likes (episode_id);

create table if not exists from_fed_to_chain.user_episode_state (
  user_id uuid references from_fed_to_chain.users(id) on delete cascade,
  episode_id uuid references from_fed_to_chain.episodes(id) on delete cascade,
  listened boolean default false,
  last_position_seconds int default 0,
  updated_at timestamptz default now(),
  primary key (user_id, episode_id)
);

create table if not exists from_fed_to_chain.language_classrooms (
  id uuid primary key default gen_random_uuid(),
  episode_localization_id uuid not null
    references from_fed_to_chain.episode_localizations(id) on delete cascade,
  source_language_code text not null,
  target_language_code text not null,
  one_liner text not null,
  keywords jsonb not null default '[]'::jsonb,
  llm_model text,
  llm_thinking_model text,
  llm_provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint language_classrooms_language_codes_not_empty
    check (btrim(source_language_code) <> '' and btrim(target_language_code) <> ''),
  constraint language_classrooms_keywords_is_array
    check (jsonb_typeof(keywords) = 'array'),
  constraint language_classrooms_localization_target_language_key
    unique (episode_localization_id, target_language_code)
);

create index if not exists idx_language_classrooms_localization
  on from_fed_to_chain.language_classrooms (episode_localization_id);

create or replace function from_fed_to_chain_private.upsert_podcast_user(
  p_email text,
  p_device_id text
)
returns table (
  id uuid,
  display_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := nullif(lower(btrim(p_email)), '');
  normalized_device_id_text text := nullif(btrim(p_device_id), '');
  normalized_device_id uuid;
  listener_name constant text := 'From Fed to Chain listener';
begin
  if (normalized_email is null) = (normalized_device_id_text is null) then
    raise exception 'Provide exactly one of p_email or p_device_id'
      using errcode = '22023';
  end if;

  if normalized_device_id_text is not null then
    if normalized_device_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'p_device_id must be UUID text'
        using errcode = '22023';
    end if;

    normalized_device_id := normalized_device_id_text::uuid;

    return query
    insert into from_fed_to_chain.users (device_id, display_name)
    values (normalized_device_id::text, listener_name)
    on conflict (device_id) do update
      set display_name = excluded.display_name
    returning users.id, users.display_name;

    return;
  end if;

  return query
  insert into from_fed_to_chain.users (email, display_name)
  values (normalized_email, listener_name)
  on conflict (email) do update
    set display_name = excluded.display_name
  returning users.id, users.display_name;
end;
$$;

create or replace function from_fed_to_chain.sign_in_podcast_user(
  p_email text default null,
  p_device_id text default null
)
returns table (
  id uuid,
  display_name text
)
language sql
security definer
set search_path = ''
as $$
  select user_row.id, user_row.display_name
  from from_fed_to_chain_private.upsert_podcast_user(p_email, p_device_id) as user_row;
$$;

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

alter table from_fed_to_chain.episodes enable row level security;
alter table from_fed_to_chain.episode_localizations enable row level security;
alter table from_fed_to_chain.episode_video_visuals enable row level security;
alter table from_fed_to_chain.episode_videos enable row level security;
alter table from_fed_to_chain.users enable row level security;
alter table from_fed_to_chain.likes enable row level security;
alter table from_fed_to_chain.user_episode_state enable row level security;
alter table from_fed_to_chain.language_classrooms enable row level security;

drop view if exists from_fed_to_chain.episodes_with_stats;
create view from_fed_to_chain.episodes_with_stats
with (security_invoker = true) as
select e.id,
       e.id as episode_id,
       el.id as localization_id,
       el.title,
       el.language_code,
       el.hls_url,
       el.classroom_hls_url,
       el.script,
       el.llm_model,
       el.llm_thinking_model,
       el.llm_provider,
       el.status,
       e.created_at,
       e.listened,
       coalesce(l.like_count, 0)::int as like_count,
        el.language_classrooms_jsonb as language_classrooms
from from_fed_to_chain.episodes e
join from_fed_to_chain.episode_localizations el on el.episode_id = e.id
left join (
  select episode_id, count(*) as like_count
  from from_fed_to_chain.likes
  group by episode_id
) l on l.episode_id = e.id
where el.status = 'completed'
  and nullif(btrim(el.hls_url), '') is not null
  and (
    el.language_code <> 'zh-Hant'
    or nullif(btrim(el.classroom_hls_url), '') is not null
  );

drop policy if exists "Service role can manage episodes"
  on from_fed_to_chain.episodes;
create policy "Service role can manage episodes"
  on from_fed_to_chain.episodes for all to service_role
  using (true) with check (true);

drop policy if exists "anon read completed podcast episodes"
  on from_fed_to_chain.episodes;
create policy "anon read completed podcast episodes"
  on from_fed_to_chain.episodes for select to anon, authenticated
  using (
    exists (
      select 1
      from from_fed_to_chain.episode_localizations el
      where el.episode_id = episodes.id
        and el.status = 'completed'
        and nullif(btrim(el.hls_url), '') is not null
        and (
          el.language_code <> 'zh-Hant'
          or nullif(btrim(el.classroom_hls_url), '') is not null
        )
    )
  );

drop policy if exists "Service role can manage episode localizations"
  on from_fed_to_chain.episode_localizations;
create policy "Service role can manage episode localizations"
  on from_fed_to_chain.episode_localizations for all to service_role
  using (true) with check (true);

drop policy if exists "Service role can manage episode videos"
  on from_fed_to_chain.episode_videos;
create policy "Service role can manage episode videos"
  on from_fed_to_chain.episode_videos for all to service_role
  using (true) with check (true);

drop policy if exists "Service role can manage episode video visuals"
  on from_fed_to_chain.episode_video_visuals;
create policy "Service role can manage episode video visuals"
  on from_fed_to_chain.episode_video_visuals for all to service_role
  using (true) with check (true);

drop policy if exists "anon read completed episode localizations"
  on from_fed_to_chain.episode_localizations;
create policy "anon read completed episode localizations"
  on from_fed_to_chain.episode_localizations for select to anon, authenticated
  using (
    status = 'completed'
    and nullif(btrim(hls_url), '') is not null
    and (
      language_code <> 'zh-Hant'
      or nullif(btrim(classroom_hls_url), '') is not null
    )
  );

drop policy if exists "anon read podcast users"
  on from_fed_to_chain.users;
create policy "anon read podcast users"
  on from_fed_to_chain.users for select to anon, authenticated
  using (device_id is not null or display_name = 'From Fed to Chain listener');

drop policy if exists "anon insert podcast users"
  on from_fed_to_chain.users;
create policy "anon insert podcast users"
  on from_fed_to_chain.users for insert to anon, authenticated
  with check (device_id is not null or display_name = 'From Fed to Chain listener');

drop policy if exists "anon update podcast users"
  on from_fed_to_chain.users;
create policy "anon update podcast users"
  on from_fed_to_chain.users for update to anon, authenticated
  using (device_id is not null or display_name = 'From Fed to Chain listener')
  with check (device_id is not null or display_name = 'From Fed to Chain listener');

drop policy if exists "anon read likes"
  on from_fed_to_chain.likes;
create policy "anon read likes"
  on from_fed_to_chain.likes for select to anon, authenticated
  using (true);

drop policy if exists "anon insert likes"
  on from_fed_to_chain.likes;
create policy "anon insert likes"
  on from_fed_to_chain.likes for insert to anon, authenticated
  with check (true);

drop policy if exists "anon delete likes"
  on from_fed_to_chain.likes;
create policy "anon delete likes"
  on from_fed_to_chain.likes for delete to anon, authenticated
  using (true);

drop policy if exists "anon update likes"
  on from_fed_to_chain.likes;
create policy "anon update likes"
  on from_fed_to_chain.likes for update to anon, authenticated
  using (true) with check (true);

drop policy if exists "anon read state"
  on from_fed_to_chain.user_episode_state;
create policy "anon read state"
  on from_fed_to_chain.user_episode_state for select to anon, authenticated
  using (true);

drop policy if exists "anon write state"
  on from_fed_to_chain.user_episode_state;
create policy "anon write state"
  on from_fed_to_chain.user_episode_state for all to anon, authenticated
  using (true) with check (true);

drop policy if exists "Service role can manage language classrooms"
  on from_fed_to_chain.language_classrooms;
create policy "Service role can manage language classrooms"
  on from_fed_to_chain.language_classrooms for all to service_role
  using (true) with check (true);

drop policy if exists "anon read completed language classrooms"
  on from_fed_to_chain.language_classrooms;
create policy "anon read completed language classrooms"
  on from_fed_to_chain.language_classrooms for select to anon, authenticated
  using (
    exists (
      select 1
      from from_fed_to_chain.episode_localizations el
      where el.id = language_classrooms.episode_localization_id
        and el.status = 'completed'
        and nullif(btrim(el.hls_url), '') is not null
        and (
          el.language_code <> 'zh-Hant'
          or nullif(btrim(el.classroom_hls_url), '') is not null
        )
    )
  );

revoke all on schema from_fed_to_chain_private from public;
revoke all on schema from_fed_to_chain_private from anon, authenticated;
grant usage on schema from_fed_to_chain to anon, authenticated, service_role;

grant all on from_fed_to_chain.episodes to service_role;
grant all on from_fed_to_chain.episode_localizations to service_role;
grant all on from_fed_to_chain.episode_video_visuals to service_role;
grant all on from_fed_to_chain.episode_videos to service_role;
grant all on from_fed_to_chain.users to service_role;
grant all on from_fed_to_chain.likes to service_role;
grant all on from_fed_to_chain.user_episode_state to service_role;
grant all on from_fed_to_chain.language_classrooms to service_role;
grant select on from_fed_to_chain.episodes_with_stats to service_role;

revoke select on from_fed_to_chain.episodes from anon, authenticated;
grant select (id, source_url, source_title, created_at, listened)
  on from_fed_to_chain.episodes to anon, authenticated;
grant select (
  id,
  episode_id,
  language_code,
  title,
  hls_url,
  classroom_hls_url,
  script,
  llm_model,
  llm_thinking_model,
  llm_provider,
  status,
  created_at
) on from_fed_to_chain.episode_localizations to anon, authenticated;
grant select (
  episode_localization_id,
  source_language_code,
  target_language_code,
  one_liner,
  keywords,
  created_at,
  updated_at
) on from_fed_to_chain.language_classrooms to anon, authenticated;
grant select on from_fed_to_chain.episodes_with_stats to anon, authenticated;

revoke all on from_fed_to_chain.episode_videos
  from public, anon, authenticated;
revoke all on from_fed_to_chain.episode_video_visuals
  from public, anon, authenticated;

revoke select, insert, update, delete on from_fed_to_chain.users
  from anon, authenticated;

revoke select, insert, update, delete on from_fed_to_chain.likes
  from anon, authenticated;
grant select (user_id, episode_id)
  on from_fed_to_chain.likes to anon, authenticated;
grant insert (user_id, episode_id)
  on from_fed_to_chain.likes to anon, authenticated;
grant update (user_id, episode_id)
  on from_fed_to_chain.likes to anon, authenticated;
grant delete on from_fed_to_chain.likes to anon, authenticated;
grant select, insert, update, delete
  on from_fed_to_chain.likes to anon, authenticated;

revoke select, insert, update, delete
  on from_fed_to_chain.user_episode_state from anon, authenticated;
grant select (user_id, episode_id, listened, last_position_seconds)
  on from_fed_to_chain.user_episode_state to anon, authenticated;
grant insert (user_id, episode_id, listened, last_position_seconds, updated_at)
  on from_fed_to_chain.user_episode_state to anon, authenticated;
grant update (user_id, episode_id, listened, last_position_seconds, updated_at)
  on from_fed_to_chain.user_episode_state to anon, authenticated;
grant select, insert, update
  on from_fed_to_chain.user_episode_state to anon, authenticated;

revoke execute on function from_fed_to_chain_private.upsert_podcast_user(text, text)
  from public, anon, authenticated;

revoke execute on function from_fed_to_chain.sign_in_podcast_user(text, text)
  from public;
grant execute on function from_fed_to_chain.sign_in_podcast_user(text, text)
  to anon, authenticated;

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
