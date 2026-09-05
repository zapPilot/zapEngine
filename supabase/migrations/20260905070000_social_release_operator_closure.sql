begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists from_fed_to_chain.social_release_closures (
  episode_id uuid primary key
    references from_fed_to_chain.episodes(id) on delete cascade,
  closed_at timestamptz not null default now(),
  closed_by text not null default 'operator',
  reason text,
  constraint social_release_closures_closed_by_not_blank
    check (nullif(btrim(closed_by), '') is not null)
);

alter table from_fed_to_chain.social_release_closures enable row level security;

create policy social_release_closures_service_all
  on from_fed_to_chain.social_release_closures
  for all to service_role
  using (true)
  with check (true);

grant all on from_fed_to_chain.social_release_closures to service_role;
revoke all on from_fed_to_chain.social_release_closures
  from public, anon, authenticated;

alter table from_fed_to_chain.social_publish_jobs
  drop constraint if exists social_publish_jobs_status_check;

alter table from_fed_to_chain.social_publish_jobs
  add constraint social_publish_jobs_status_check
  check (status in ('queued', 'processing', 'completed', 'failed', 'skipped'));

create or replace function from_fed_to_chain.close_social_release(
  p_episode_id uuid,
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = from_fed_to_chain, pg_temp
as $$
declare
  skipped_count integer;
begin
  if exists (
    select 1
    from from_fed_to_chain.social_publish_jobs job
    where job.episode_id = p_episode_id
      and job.status = 'processing'
      and job.lease_expires_at > p_now
  ) then
    raise exception 'Social release is currently processing and cannot be closed'
      using errcode = '55000';
  end if;

  insert into from_fed_to_chain.social_release_closures (
    episode_id,
    closed_at,
    closed_by,
    reason
  )
  values (
    p_episode_id,
    p_now,
    'operator',
    'Closed from Control Center; keep published posts and skip remaining lanes.'
  )
  on conflict (episode_id) do nothing;

  update from_fed_to_chain.social_publish_jobs
  set
    status = 'skipped',
    completed_at = coalesce(completed_at, p_now),
    lease_owner = null,
    lease_expires_at = null,
    last_error = 'Skipped by operator social release closure',
    updated_at = p_now
  where episode_id = p_episode_id
    and (
      status in ('queued', 'failed')
      or (
        status = 'processing'
        and (lease_expires_at is null or lease_expires_at <= p_now)
      )
    );

  get diagnostics skipped_count = row_count;
  return skipped_count;
end;
$$;

revoke execute on function from_fed_to_chain.close_social_release(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.close_social_release(uuid, timestamptz)
  to service_role;

create or replace function from_fed_to_chain_private.guard_closed_social_release()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from from_fed_to_chain.social_release_closures closure
    where closure.episode_id = new.episode_id
  ) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists social_publish_jobs_closed_release_guard
  on from_fed_to_chain.social_publish_jobs;

create trigger social_publish_jobs_closed_release_guard
before insert on from_fed_to_chain.social_publish_jobs
for each row
execute function from_fed_to_chain_private.guard_closed_social_release();

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
  and video.duration_seconds > 0
  and not exists (
    select 1
    from from_fed_to_chain.social_release_closures closure
    where closure.episode_id = video.episode_id
  );

grant select on from_fed_to_chain.social_publish_candidates to service_role;

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
  null::text as experiment_variant
from from_fed_to_chain.episodes episode
cross join required_language
join from_fed_to_chain.episode_localizations localization
  on localization.episode_id = episode.id
  and localization.language_code = required_language.language_code
  and localization.status = 'completed'
left join from_fed_to_chain.episode_videos video
  on video.episode_localization_id = localization.id
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
