alter table from_fed_to_chain.social_publish_jobs
  add column language_code text;

update from_fed_to_chain.social_publish_jobs
set language_code = 'zh-Hant'
where language_code is null;

alter table from_fed_to_chain.social_publish_jobs
  alter column language_code set not null,
  add constraint social_publish_jobs_language_code_check
    check (language_code in ('zh-Hant', 'ja', 'en')),
  add column experiment_key text,
  add column experiment_variant text,
  add constraint social_publish_jobs_experiment_pair_check
    check (
      (experiment_key is null and experiment_variant is null)
      or (
        nullif(btrim(experiment_key), '') is not null
        and nullif(btrim(experiment_variant), '') is not null
      )
    );

alter table from_fed_to_chain.social_publish_jobs
  drop constraint social_publish_jobs_episode_id_platform_key,
  add constraint social_publish_jobs_episode_platform_language_key
    unique (episode_id, platform, language_code);

alter table from_fed_to_chain.social_posts
  add column language_code text;

update from_fed_to_chain.social_posts
set language_code = 'zh-Hant'
where language_code is null;

alter table from_fed_to_chain.social_posts
  alter column language_code set not null,
  add constraint social_posts_language_code_check
    check (language_code in ('zh-Hant', 'ja', 'en')),
  add column experiment_key text,
  add column experiment_variant text,
  add constraint social_posts_experiment_pair_check
    check (
      (experiment_key is null and experiment_variant is null)
      or (
        nullif(btrim(experiment_key), '') is not null
        and nullif(btrim(experiment_variant), '') is not null
      )
    );

drop index from_fed_to_chain.idx_social_posts_episode_platform;
create index idx_social_posts_episode_platform_language
  on from_fed_to_chain.social_posts (episode_id, platform, language_code);

alter table from_fed_to_chain.social_strategy_versions
  add column language_code text;

update from_fed_to_chain.social_strategy_versions
set language_code = 'zh-Hant'
where language_code is null;

alter table from_fed_to_chain.social_strategy_versions
  alter column language_code set not null,
  add constraint social_strategy_versions_language_code_check
    check (language_code in ('zh-Hant', 'ja', 'en')),
  drop constraint social_strategy_versions_platform_version_key,
  add constraint social_strategy_versions_platform_language_version_key
    unique (platform, language_code, version);

drop index from_fed_to_chain.idx_social_strategy_versions_one_active;
create unique index idx_social_strategy_versions_one_active
  on from_fed_to_chain.social_strategy_versions (platform, language_code)
  where active;

create table from_fed_to_chain.social_experiment_assignments (
  experiment_key text not null,
  episode_id uuid not null references from_fed_to_chain.episodes(id) on delete cascade,
  variant text not null,
  assigned_at timestamptz not null default now(),
  primary key (experiment_key, episode_id),
  constraint social_experiment_assignments_key_not_blank
    check (nullif(btrim(experiment_key), '') is not null),
  constraint social_experiment_assignments_variant_not_blank
    check (nullif(btrim(variant), '') is not null)
);

alter table from_fed_to_chain.social_experiment_assignments enable row level security;

create policy social_experiment_assignments_service_all
  on from_fed_to_chain.social_experiment_assignments
  for all to service_role
  using (true)
  with check (true);

revoke all on from_fed_to_chain.social_experiment_assignments from anon, authenticated;
grant all on from_fed_to_chain.social_experiment_assignments to service_role;

create or replace view from_fed_to_chain.social_publish_candidates as
select
  video.episode_id,
  coalesce(video.completed_at, video.updated_at, video.created_at) as ready_at,
  localization.language_code,
  episode.created_at as episode_created_at
from from_fed_to_chain.episode_videos video
join from_fed_to_chain.episode_localizations localization
  on localization.id = video.episode_localization_id
join from_fed_to_chain.episodes episode
  on episode.id = video.episode_id
where localization.language_code in ('zh-Hant', 'ja', 'en')
  and localization.status = 'completed'
  and video.status = 'completed'
  and nullif(btrim(video.mp4_url), '') is not null
  and nullif(btrim(video.thumbnail_url), '') is not null
  and video.duration_seconds is not null
  and video.duration_seconds > 0;

grant select on from_fed_to_chain.social_publish_candidates to service_role;

create view from_fed_to_chain.social_waiting_media as
with policy(platform, language_code, active_since, experiment_key) as (
  values
    ('rednote'::text, 'zh-Hant'::text, '2026-08-24T00:00:00.000Z'::timestamptz, null::text),
    ('threads', 'ja', '2026-08-24T00:00:00.000Z'::timestamptz, null),
    ('x', 'en', '2026-08-24T00:00:00.000Z'::timestamptz, 'x-language-v1'),
    ('x', 'ja', '2026-08-24T00:00:00.000Z'::timestamptz, 'x-language-v1'),
    ('youtube', 'en', '2026-08-24T00:00:00.000Z'::timestamptz, null),
    ('youtube', 'ja', '2026-08-24T00:00:00.000Z'::timestamptz, null)
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
