-- Repair production drift where the episode_videos table has the migration 019
-- visual-checkpoint columns, but enqueue_episode_video still has the migration
-- 018 body and therefore omits the now-required episode_id column.

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
