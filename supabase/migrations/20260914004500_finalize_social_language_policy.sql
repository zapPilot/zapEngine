begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Product decision 2026-09-14: language experiments are concluded.
-- Final steady-state lanes are:
--   Rednote  -> zh-Hant
--   Threads  -> zh-Hant
--   X        -> ja
--   YouTube  -> en
--
-- Rewrite only completely unpublished, fully queued four-lane cohorts whose
-- whole release is still in the future at the final cutover. Partial releases,
-- processing rows, completed rows, and any episode with a durable social post
-- remain untouched so a deploy cannot duplicate or reshape live content.
with candidate_episodes as (
  select job.episode_id
  from from_fed_to_chain.social_publish_jobs job
  group by job.episode_id
  having count(*) = 4
    and count(distinct job.platform) = 4
    and bool_and(job.status = 'queued')
    and bool_and(job.social_post_id is null)
    and min(job.scheduled_at) >= '2026-09-14T00:00:00.000Z'::timestamptz
    and not exists (
      select 1
      from from_fed_to_chain.social_posts post
      where post.episode_id = job.episode_id
    )
)
update from_fed_to_chain.social_publish_jobs job
set
  language_code = case job.platform
    when 'rednote' then 'zh-Hant'
    when 'threads' then 'zh-Hant'
    when 'x' then 'ja'
    when 'youtube' then 'en'
    else job.language_code
  end,
  experiment_key = null,
  experiment_variant = null,
  strategy_version_id = null,
  updated_at = now()
where job.episode_id in (select episode_id from candidate_episodes);

-- Remove only language-generation assignments for the cohorts rewritten above.
-- Historical published assignments/metrics remain intact for experiment analysis.
with candidate_episodes as (
  select job.episode_id
  from from_fed_to_chain.social_publish_jobs job
  group by job.episode_id
  having count(*) = 4
    and count(distinct job.platform) = 4
    and bool_and(job.status = 'queued')
    and bool_and(job.social_post_id is null)
    and min(job.scheduled_at) >= '2026-09-14T00:00:00.000Z'::timestamptz
    and not exists (
      select 1
      from from_fed_to_chain.social_posts post
      where post.episode_id = job.episode_id
    )
)
delete from from_fed_to_chain.social_experiment_assignments assignment
where assignment.episode_id in (select episode_id from candidate_episodes)
  and assignment.experiment_key in (
    'x-language-v1',
    'social-language-profile-v2',
    'social-language-profile-v3'
  );

commit;
