-- Durable local social daemon state, publishing queue, strategy versions, and
-- standardized metric windows. The daemon itself still runs on the operator's
-- Mac because X/Rednote depend on persistent browser sessions.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table from_fed_to_chain.social_post_metrics
  add column if not exists measurement_window text;

alter table from_fed_to_chain.social_post_metrics
  drop constraint if exists social_post_metrics_measurement_window_check;

alter table from_fed_to_chain.social_post_metrics
  add constraint social_post_metrics_measurement_window_check check (
    measurement_window is null
    or measurement_window in ('1h', '6h', '24h', '72h', '7d')
  );

create unique index if not exists idx_social_post_metrics_standard_window
  on from_fed_to_chain.social_post_metrics (social_post_id, measurement_window)
  where measurement_window is not null;

create table if not exists from_fed_to_chain.social_daemon_state (
  id text primary key,
  first_started_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_daemon_state_id_not_blank check (nullif(btrim(id), '') is not null)
);

create table if not exists from_fed_to_chain.social_strategy_versions (
  id uuid primary key default gen_random_uuid(),
  platform text not null
    check (platform in ('x', 'threads', 'rednote', 'youtube')),
  version integer not null check (version > 0),
  config jsonb not null default '{}'::jsonb,
  based_on_samples integer not null default 0 check (based_on_samples >= 0),
  active boolean not null default false,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint social_strategy_versions_config_is_object check (jsonb_typeof(config) = 'object'),
  constraint social_strategy_versions_active_has_timestamp check (
    not active or activated_at is not null
  ),
  unique (platform, version)
);

create unique index if not exists idx_social_strategy_versions_one_active
  on from_fed_to_chain.social_strategy_versions (platform)
  where active;

create table if not exists from_fed_to_chain.social_publish_jobs (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null
    references from_fed_to_chain.episodes(id) on delete cascade,
  platform text not null
    check (platform in ('x', 'threads', 'rednote', 'youtube')),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed')),
  scheduled_at timestamptz not null,
  next_attempt_at timestamptz not null,
  strategy_version_id uuid
    references from_fed_to_chain.social_strategy_versions(id) on delete set null,
  social_post_id uuid
    references from_fed_to_chain.social_posts(id) on delete set null,
  attempt_count integer not null default 0 check (attempt_count >= 0 and attempt_count <= 8),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_publish_jobs_processing_has_lease check (
    (
      status = 'processing'
      and nullif(btrim(lease_owner), '') is not null
      and lease_expires_at is not null
    )
    or (
      status <> 'processing'
      and lease_owner is null
      and lease_expires_at is null
    )
  ),
  constraint social_publish_jobs_completed_has_timestamp check (
    status <> 'completed' or completed_at is not null
  ),
  unique (episode_id, platform)
);

create index if not exists idx_social_publish_jobs_due
  on from_fed_to_chain.social_publish_jobs (next_attempt_at, scheduled_at)
  where status in ('queued', 'failed');

create index if not exists idx_social_publish_jobs_expired_lease
  on from_fed_to_chain.social_publish_jobs (lease_expires_at)
  where status = 'processing';

create or replace view from_fed_to_chain.social_publish_candidates as
select
  video.episode_id,
  coalesce(video.completed_at, video.updated_at, video.created_at) as ready_at
from from_fed_to_chain.episode_videos video
join from_fed_to_chain.episode_localizations localization
  on localization.id = video.episode_localization_id
where localization.language_code = 'zh-Hant'
  and localization.status = 'completed'
  and video.status = 'completed'
  and nullif(btrim(video.mp4_url), '') is not null
  and nullif(btrim(video.thumbnail_url), '') is not null
  and video.duration_seconds is not null
  and video.duration_seconds > 0;

create or replace function from_fed_to_chain.claim_social_publish_job(
  p_owner text,
  p_now timestamptz default now()
)
returns setof from_fed_to_chain.social_publish_jobs
language plpgsql
security definer
set search_path = from_fed_to_chain, pg_temp
as $$
declare
  claimed_id uuid;
begin
  if nullif(btrim(p_owner), '') is null then
    raise exception 'p_owner must not be blank';
  end if;

  select job.id
    into claimed_id
  from from_fed_to_chain.social_publish_jobs job
  where job.scheduled_at <= p_now
    and job.attempt_count < 8
    and (
      (job.status in ('queued', 'failed') and job.next_attempt_at <= p_now)
      or (job.status = 'processing' and job.lease_expires_at <= p_now)
    )
  order by job.scheduled_at asc, job.created_at asc
  for update skip locked
  limit 1;

  if claimed_id is null then
    return;
  end if;

  return query
  update from_fed_to_chain.social_publish_jobs
  set
    status = 'processing',
    attempt_count = attempt_count + 1,
    lease_owner = p_owner,
    lease_expires_at = p_now + interval '60 minutes',
    last_error = null,
    updated_at = p_now
  where id = claimed_id
  returning *;
end;
$$;

alter table from_fed_to_chain.social_daemon_state enable row level security;
alter table from_fed_to_chain.social_strategy_versions enable row level security;
alter table from_fed_to_chain.social_publish_jobs enable row level security;

create policy social_daemon_state_service_all
  on from_fed_to_chain.social_daemon_state for all to service_role
  using (true) with check (true);
create policy social_strategy_versions_service_all
  on from_fed_to_chain.social_strategy_versions for all to service_role
  using (true) with check (true);
create policy social_publish_jobs_service_all
  on from_fed_to_chain.social_publish_jobs for all to service_role
  using (true) with check (true);

grant all on from_fed_to_chain.social_daemon_state to service_role;
grant all on from_fed_to_chain.social_strategy_versions to service_role;
grant all on from_fed_to_chain.social_publish_jobs to service_role;
grant select on from_fed_to_chain.social_publish_candidates to service_role;
grant execute on function from_fed_to_chain.claim_social_publish_job(text, timestamptz) to service_role;

revoke all on from_fed_to_chain.social_daemon_state from public, anon, authenticated;
revoke all on from_fed_to_chain.social_strategy_versions from public, anon, authenticated;
revoke all on from_fed_to_chain.social_publish_jobs from public, anon, authenticated;
revoke all on from_fed_to_chain.social_publish_candidates from public, anon, authenticated;
revoke execute on function from_fed_to_chain.claim_social_publish_job(text, timestamptz)
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
