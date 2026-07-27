begin;

-- Migration 021: version-fence the video queue claim RPCs.
--
-- Multiple worker fleets (local dev, Fly prod) share this database. The
-- pre-021 claim functions hand out any queued row regardless of
-- visual_version, so a worker built against an older pipeline recipe can
-- claim a newer job and burn all three attempts on
-- "Unsupported episode visual version". The *_v2 claim functions only hand
-- out rows matching the caller's supported version; the legacy signatures
-- become inert stubs so not-yet-redeployed workers idle quietly instead of
-- poaching jobs. The _v2 suffix versions the claim API shape, not the visual
-- plan version — future plan bumps keep calling the same _v2 functions.

create or replace function from_fed_to_chain.claim_episode_video_visual(
  p_lease_owner text
)
returns setof from_fed_to_chain.episode_video_visuals
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Deprecation fence: pre-021 workers poll this signature. Return no rows
  -- so they idle quietly and never claim jobs enqueued by newer code.
  -- Current workers call claim_episode_video_visual_v2 instead.
  return;
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
  -- Deprecation fence: see claim_episode_video_visual above.
  return;
end;
$$;

-- Version-fenced visual claim. Body mirrors migration 019 plus the
-- p_visual_version guard and the candidate version fence. The expired-lease
-- sweep intentionally stays unfenced: releasing any version's expired lease
-- is safe, and the stubbed legacy functions no longer sweep at all.
create or replace function from_fed_to_chain.claim_episode_video_visual_v2(
  p_lease_owner text,
  p_visual_version text
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

  if nullif(btrim(p_visual_version), '') is null then
    raise exception 'p_visual_version must not be empty'
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
      and visual.visual_version = btrim(p_visual_version)
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

-- Version-fenced localization claim (same pattern as the visual claim).
create or replace function from_fed_to_chain.claim_episode_video_v2(
  p_lease_owner text,
  p_visual_version text
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

  if nullif(btrim(p_visual_version), '') is null then
    raise exception 'p_visual_version must not be empty'
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
      and video.visual_version = btrim(p_visual_version)
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

revoke execute on function from_fed_to_chain.claim_episode_video_visual_v2(
  text,
  text
) from public, anon, authenticated;
grant execute on function from_fed_to_chain.claim_episode_video_visual_v2(
  text,
  text
) to service_role;

revoke execute on function from_fed_to_chain.claim_episode_video_v2(text, text)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.claim_episode_video_v2(text, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
