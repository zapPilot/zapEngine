begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- An abandoned video pipeline is terminal until an operator explicitly reopens
-- it. Keeping those episodes in social_waiting_media makes the social surface
-- claim that media is merely "catching up" even though no render worker is
-- allowed to finish the lane. Keep release closure and video abandonment in
-- agreement: neither is actionable waiting media.
--
-- The appended columns exist because a lane count cannot tell a fresh lane from
-- one that has been stuck for days: production held a single waiting lane for
-- roughly 240 hours while the count-based signal stayed healthy. They carry the
-- inputs `claim_episode_video_v2` fences on, so a reader can separate "slow" from
-- "no worker will ever take this".
--
-- They are facts, never a verdict. No threshold, no visual-version constant and
-- no derived claimable/blocked flag belongs here: `20260828143000` had to undo
-- exactly that when a second copy of the language policy drifted from the one
-- `src/social/policy.ts` owns. Eligibility is decided in
-- `apps/control-center/src/server/services/podcast-retry-eligibility.ts`, which
-- already owns that judgement for three other read models.
--
-- Keeping the view out of `ops.*` is also deliberate: every table read here is
-- already granted to service_role, so the view keeps working if it is ever
-- switched to `security_invoker = true` the way `20260827132739` switched
-- another view for good security reasons.
--
-- Columns are appended at the end. `create or replace view` forbids renaming or
-- reordering the existing six, and `apps/podcast-pipeline` reads this view by
-- name for `episode_id,language_code`.

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
  -- The claim joins the checkpoint on BOTH hash and version, so a render row
  -- whose version still matches while its hash does not is unclaimable. Without
  -- the hashes a stale checkpoint reads as merely slow.
  video.visual_hash as render_visual_hash,
  progress_visual.status as visual_status,
  progress_visual.visual_version as visual_version,
  progress_visual.visual_hash as visual_hash
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
