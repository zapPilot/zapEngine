-- YouTube distribution is English-only. `social_waiting_media` carries a second
-- copy of the language policy that `src/social/policy.ts` owns, so the two have
-- to move together: leaving `ja` here would keep reporting a Japanese asset as
-- media the YouTube lane is waiting for, for a lane that is no longer shipped.
--
-- Nothing else changes. Retired strategy rows are deactivated by the next
-- `refreshSocialStrategies` rather than by SQL here, so the policy stays the
-- single place a lane is declared, and no publish job is rewritten: marking a
-- queued row `completed` would record a post that never existed.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace view from_fed_to_chain.social_waiting_media as
with policy(platform, language_code, active_since, experiment_key) as (
  values
    ('rednote'::text, 'zh-Hant'::text, '2026-08-24T00:00:00.000Z'::timestamptz, null::text),
    ('threads', 'ja', '2026-08-24T00:00:00.000Z'::timestamptz, null),
    ('x', 'en', '2026-08-24T00:00:00.000Z'::timestamptz, 'x-language-v1'),
    ('x', 'ja', '2026-08-24T00:00:00.000Z'::timestamptz, 'x-language-v1'),
    ('youtube', 'en', '2026-08-24T00:00:00.000Z'::timestamptz, null)
)
select
  localization.episode_id,
  policy.platform,
  policy.language_code,
  localization.title,
  policy.experiment_key,
  assignment.variant as experiment_variant
from policy
join from_fed_to_chain.episodes episode
  on episode.created_at >= policy.active_since
join from_fed_to_chain.episode_localizations localization
  on localization.episode_id = episode.id
  and localization.language_code = policy.language_code
  and localization.status = 'completed'
left join from_fed_to_chain.episode_videos video
  on video.episode_localization_id = localization.id
left join from_fed_to_chain.social_experiment_assignments assignment
  on assignment.experiment_key = policy.experiment_key
  and assignment.episode_id = localization.episode_id
left join from_fed_to_chain.social_publish_jobs job
  on job.episode_id = localization.episode_id
  and job.platform = policy.platform
  and job.language_code = policy.language_code
left join from_fed_to_chain.social_posts post
  on post.episode_id = localization.episode_id
  and post.platform = policy.platform
  and post.language_code = policy.language_code
where (
    video.episode_localization_id is null
    or video.status <> 'completed'
    or nullif(btrim(video.mp4_url), '') is null
    or nullif(btrim(video.thumbnail_url), '') is null
    or coalesce(video.duration_seconds, 0) <= 0
  )
  and job.id is null
  and post.id is null
  and (
    policy.experiment_key is null
    or assignment.variant = policy.language_code
  );

grant select on from_fed_to_chain.social_waiting_media to service_role;

notify pgrst, 'reload schema';

commit;
