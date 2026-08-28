-- Social release timing is platform-specific. Language lanes remain atomic
-- inside one (episode, platform) cohort, while different platforms may publish
-- the same episode at different work-hour slots.

drop function if exists from_fed_to_chain.claim_social_publish_batch(text, timestamptz, uuid);

create or replace function from_fed_to_chain.claim_social_publish_batch(
  p_owner text,
  p_now timestamptz default now(),
  p_episode_id uuid default null,
  p_platform text default null
)
returns setof from_fed_to_chain.social_publish_jobs
language plpgsql
security definer
set search_path = from_fed_to_chain, pg_temp
as $$
declare
  seed_episode_id uuid;
  seed_platform text;
begin
  if nullif(btrim(p_owner), '') is null then
    raise exception 'p_owner must not be blank';
  end if;
  if p_platform is not null
    and p_platform not in ('x', 'threads', 'rednote', 'youtube') then
    raise exception 'unsupported social platform: %', p_platform;
  end if;

  select job.episode_id, job.platform
    into seed_episode_id, seed_platform
  from from_fed_to_chain.social_publish_jobs job
  where job.scheduled_at <= p_now
    and job.attempt_count < 8
    and (p_episode_id is null or job.episode_id = p_episode_id)
    and (p_platform is null or job.platform = p_platform)
    and (
      (job.status in ('queued', 'failed') and job.next_attempt_at <= p_now)
      or (job.status = 'processing' and job.lease_expires_at <= p_now)
    )
  order by job.scheduled_at asc, job.created_at asc
  for update skip locked
  limit 1;

  if seed_episode_id is null or seed_platform is null then
    return;
  end if;

  return query
  update from_fed_to_chain.social_publish_jobs job
  set
    status = 'processing',
    attempt_count = job.attempt_count + 1,
    lease_owner = p_owner,
    lease_expires_at = p_now + interval '60 minutes',
    last_error = null,
    updated_at = p_now
  where job.episode_id = seed_episode_id
    and job.platform = seed_platform
    and job.scheduled_at <= p_now
    and job.attempt_count < 8
    and (
      (job.status in ('queued', 'failed') and job.next_attempt_at <= p_now)
      or (job.status = 'processing' and job.lease_expires_at <= p_now)
    )
  returning job.*;
end;
$$;

grant execute on function from_fed_to_chain.claim_social_publish_batch(text, timestamptz, uuid, text)
  to service_role;
revoke execute on function from_fed_to_chain.claim_social_publish_batch(text, timestamptz, uuid, text)
  from public, anon, authenticated;

-- YouTube distribution is English-only for this baseline. Preserve old queue
-- rows as audit evidence rather than deleting them.
update from_fed_to_chain.social_strategy_versions
set active = false
where platform = 'youtube'
  and language_code <> 'en'
  and active = true;

update from_fed_to_chain.social_publish_jobs
set
  status = 'completed',
  completed_at = now(),
  lease_owner = null,
  lease_expires_at = null,
  last_error = 'skipped: strategy_superseded; youtube en-only baseline',
  updated_at = now()
where platform = 'youtube'
  and language_code <> 'en'
  and status in ('queued', 'failed');

-- Make the active strategy rows the scheduling source of truth. Existing copy
-- preferences stay intact; these keys only replace the legacy four-slot timing.
update from_fed_to_chain.social_strategy_versions
set config = config || jsonb_build_object(
  'dailyPublishCap', 1,
  'slotExplorationRate', 0.2,
  'publishSlotsJst', jsonb_build_array(
    jsonb_build_object('hour', 14, 'minute', 30),
    jsonb_build_object('hour', 12, 'minute', 0)
  )
)
where platform = 'rednote' and active = true;

update from_fed_to_chain.social_strategy_versions
set config = config || jsonb_build_object(
  'dailyPublishCap', 1,
  'slotExplorationRate', 0.5,
  'publishSlotsJst', jsonb_build_array(
    jsonb_build_object('hour', 12, 'minute', 0),
    jsonb_build_object('hour', 9, 'minute', 30)
  )
)
where platform = 'threads' and active = true;

update from_fed_to_chain.social_strategy_versions
set config = config || jsonb_build_object(
  'dailyPublishCap', 2,
  'slotExplorationRate', 0,
  'publishSlotsJst', jsonb_build_array(
    jsonb_build_object('hour', 12, 'minute', 15),
    jsonb_build_object('hour', 17, 'minute', 0)
  )
)
where platform = 'x' and active = true;

update from_fed_to_chain.social_strategy_versions
set config = config || jsonb_build_object(
  'dailyPublishCap', 1,
  'slotExplorationRate', 0,
  'publishSlotsJst', jsonb_build_array(
    jsonb_build_object('hour', 17, 'minute', 15)
  )
)
where platform = 'youtube' and language_code = 'en' and active = true;

-- Re-space already queued future work so merging this migration cannot leave
-- the legacy four-slots-per-day backlog publishing at its old cadence. Keep
-- processing jobs untouched. The next clean JST day is used as the anchor.
with cohort as (
  select
    episode_id,
    platform,
    min(created_at) as first_created_at
  from from_fed_to_chain.social_publish_jobs
  where status in ('queued', 'failed')
    and scheduled_at > now()
  group by episode_id, platform
), ranked as (
  select
    episode_id,
    platform,
    row_number() over (
      partition by platform
      order by first_created_at asc, episode_id asc
    ) as rn
  from cohort
), planned as (
  select
    episode_id,
    platform,
    case platform
      when 'rednote' then
        (
          date_trunc('day', timezone('Asia/Tokyo', now()))
          + interval '1 day'
          + (rn - 1) * interval '1 day'
          + interval '14 hours 30 minutes'
        ) at time zone 'Asia/Tokyo'
      when 'threads' then
        (
          date_trunc('day', timezone('Asia/Tokyo', now()))
          + interval '1 day'
          + (rn - 1) * interval '1 day'
          + interval '12 hours'
        ) at time zone 'Asia/Tokyo'
      when 'youtube' then
        (
          date_trunc('day', timezone('Asia/Tokyo', now()))
          + interval '1 day'
          + (rn - 1) * interval '1 day'
          + interval '17 hours 15 minutes'
        ) at time zone 'Asia/Tokyo'
      when 'x' then
        (
          date_trunc('day', timezone('Asia/Tokyo', now()))
          + interval '1 day'
          + floor((rn - 1)::numeric / 2) * interval '1 day'
          + case when mod((rn - 1)::integer, 2) = 0
              then interval '12 hours 15 minutes'
              else interval '17 hours'
            end
        ) at time zone 'Asia/Tokyo'
    end as scheduled_at
  from ranked
), jobs as (
  select
    job.id,
    job.status,
    job.next_attempt_at,
    planned.scheduled_at
  from from_fed_to_chain.social_publish_jobs job
  join planned
    on planned.episode_id = job.episode_id
    and planned.platform = job.platform
  where job.status in ('queued', 'failed')
)
update from_fed_to_chain.social_publish_jobs job
set
  scheduled_at = jobs.scheduled_at,
  next_attempt_at = case
    when jobs.status = 'failed'
      then greatest(jobs.next_attempt_at, jobs.scheduled_at)
    else jobs.scheduled_at
  end,
  updated_at = now()
from jobs
where job.id = jobs.id;

-- Keep the dashboard/waiting-media projection aligned with code-owned language
-- policy: generating a Japanese asset no longer implies scheduling it to the
-- YouTube channel.
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
