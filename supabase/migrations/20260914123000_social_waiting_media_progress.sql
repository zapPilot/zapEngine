begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- An abandoned video pipeline is terminal until an operator explicitly reopens
-- it. Keeping those episodes in social_waiting_media makes the social surface
-- claim that media is merely "catching up" even though no render worker is
-- allowed to finish the lane. Keep release closure and video abandonment in
-- agreement: neither is actionable waiting media.

create or replace view from_fed_to_chain.social_waiting_media as
with required_language(language_code) as (
  values
    ('zh-Hant'::text),
    ('ja'::text),
    ('en'::text)
)
select
  localization.episode_id,
  null::text as platform,
  required_language.language_code,
  localization.title,
  null::text as experiment_key,
  null::text as experiment_variant,
  greatest(episode.created_at, localization.created_at) as waiting_since,
  video.updated_at as last_progress_at,
  video.status as render_status,
  video.attempt_count as render_attempt_count,
  video.next_attempt_at as render_next_attempt_at,
  video.lease_expires_at as render_lease_expires_at,
  video.visual_version as render_visual_version,
  progress_visual.status as visual_status,
  progress_visual.visual_version as visual_version
from from_fed_to_chain.episodes episode
cross join required_language
join from_fed_to_chain.episode_localizations localization
  on localization.episode_id = episode.id
  and localization.language_code = required_language.language_code
  and localization.status = 'completed'
left join from_fed_to_chain.episode_videos video
  on video.episode_localization_id = localization.id
left join from_fed_to_chain.episode_video_visuals progress_visual
  on progress_visual.episode_id = episode.id
where episode.created_at >= '2026-08-24T00:00:00.000Z'::timestamptz
  and (
    video.episode_localization_id is null
    or video.status <> 'completed'
    or nullif(btrim(video.mp4_url), '') is null
    or nullif(btrim(video.thumbnail_url), '') is null
    or coalesce(video.duration_seconds, 0) <= 0
  )
  and not exists (
    select 1
    from from_fed_to_chain.episode_video_visuals visual
    where visual.episode_id = episode.id
      and visual.abandoned_at is not null
  )
  and not exists (
    select 1
    from from_fed_to_chain.social_publish_jobs job
    where job.episode_id = episode.id
  )
  and not exists (
    select 1
    from from_fed_to_chain.social_posts post
    where post.episode_id = episode.id
  )
  and not exists (
    select 1
    from from_fed_to_chain.social_release_closures closure
    where closure.episode_id = episode.id
  );

grant select on from_fed_to_chain.social_waiting_media to service_role;

notify pgrst, 'reload schema';

commit;
