begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists ops.podcast_deployment_control (
  singleton boolean primary key default true check (singleton),
  phase text not null default 'open' check (
    phase in ('open', 'draining', 'rolling_out', 'recovery_required')
  ),
  deployment_id uuid,
  owner_token uuid,
  target_release text,
  heartbeat_at timestamptz,
  rollout_started_at timestamptz,
  recovery_reason text,
  updated_at timestamptz not null default now(),
  constraint podcast_deployment_open_shape check (
    (phase = 'open' and deployment_id is null and owner_token is null)
    or
    (phase <> 'open' and deployment_id is not null and owner_token is not null)
  )
);

insert into ops.podcast_deployment_control (singleton, phase)
values (true, 'open')
on conflict (singleton) do nothing;

revoke all on table ops.podcast_deployment_control
  from public, anon, authenticated, service_role;

create or replace function ops.lock_podcast_deployment_gate()
returns void
language sql
security invoker
set search_path = ''
as $$
  select pg_advisory_xact_lock(
    hashtextextended('zapengine:podcast-deployment-gate', 0)
  );
$$;
revoke execute on function ops.lock_podcast_deployment_gate()
  from public, anon, authenticated, service_role;

create or replace function from_fed_to_chain.podcast_deployment_claims_open()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (select phase = 'open'
       from ops.podcast_deployment_control
      where singleton = true),
    false
  );
$$;

create or replace function from_fed_to_chain.podcast_deployment_state()
returns table (
  phase text,
  deployment_id uuid,
  target_release text,
  heartbeat_at timestamptz,
  rollout_started_at timestamptz,
  recovery_reason text,
  updated_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    state.phase,
    state.deployment_id,
    state.target_release,
    state.heartbeat_at,
    state.rollout_started_at,
    state.recovery_reason,
    state.updated_at
  from ops.podcast_deployment_control state
  where state.singleton = true;
$$;

create or replace function from_fed_to_chain.podcast_deployment_acquire(
  p_deployment_id uuid,
  p_owner_token uuid,
  p_target_release text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phase text;
begin
  if nullif(btrim(p_target_release), '') is null then
    raise exception using errcode = '22023', message = 'target release must not be empty';
  end if;

  perform ops.lock_podcast_deployment_gate();
  select phase into v_phase
    from ops.podcast_deployment_control
   where singleton = true
   for update;

  if v_phase is distinct from 'open' then
    raise exception using
      errcode = '55000',
      message = format(
        'podcast deployment gate is %s; another deployment or recovery owns it',
        coalesce(v_phase, 'missing')
      );
  end if;

  update ops.podcast_deployment_control
     set phase = 'draining',
         deployment_id = p_deployment_id,
         owner_token = p_owner_token,
         target_release = btrim(p_target_release),
         heartbeat_at = now(),
         rollout_started_at = null,
         recovery_reason = null,
         updated_at = now()
   where singleton = true;
end;
$$;

create or replace function from_fed_to_chain.podcast_deployment_heartbeat(
  p_deployment_id uuid,
  p_owner_token uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update ops.podcast_deployment_control
     set heartbeat_at = now(), updated_at = now()
   where singleton = true
     and deployment_id = p_deployment_id
     and owner_token = p_owner_token
     and phase <> 'open';
  if not found then
    raise exception using errcode = '55000', message = 'podcast deployment fencing token is no longer current';
  end if;
end;
$$;

create or replace function from_fed_to_chain.podcast_deployment_drain_status(
  p_deployment_id uuid,
  p_owner_token uuid
)
returns table (
  phase text,
  active_video_jobs bigint,
  active_visual_jobs bigint,
  heartbeat_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from ops.podcast_deployment_control state
     where state.singleton = true
       and state.deployment_id = p_deployment_id
       and state.owner_token = p_owner_token
       and state.phase in ('draining', 'rolling_out')
  ) then
    raise exception using errcode = '55000', message = 'podcast deployment fencing token is no longer current';
  end if;

  return query
  select
    state.phase,
    (select count(*)
       from from_fed_to_chain.episode_videos video
      where video.status = 'processing'
        and video.lease_expires_at is not null
        and video.lease_expires_at > now()),
    (select count(*)
       from from_fed_to_chain.episode_video_visuals visual
      where visual.status = 'processing'
        and visual.lease_expires_at is not null
        and visual.lease_expires_at > now()),
    state.heartbeat_at
  from ops.podcast_deployment_control state
  where state.singleton = true;
end;
$$;

create or replace function from_fed_to_chain.podcast_deployment_mark_rollout(
  p_deployment_id uuid,
  p_owner_token uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active bigint;
begin
  perform ops.lock_podcast_deployment_gate();

  if not exists (
    select 1
      from ops.podcast_deployment_control state
     where state.singleton = true
       and state.deployment_id = p_deployment_id
       and state.owner_token = p_owner_token
       and state.phase = 'draining'
  ) then
    raise exception using errcode = '55000', message = 'podcast deployment is not owned in draining phase';
  end if;

  select
    (select count(*)
       from from_fed_to_chain.episode_videos
      where status = 'processing'
        and lease_expires_at is not null
        and lease_expires_at > now())
    +
    (select count(*)
       from from_fed_to_chain.episode_video_visuals
      where status = 'processing'
        and lease_expires_at is not null
        and lease_expires_at > now())
  into v_active;

  if v_active <> 0 then
    raise exception using
      errcode = '55000',
      message = format('%s active render jobs remain; rollout blocked', v_active);
  end if;

  update ops.podcast_deployment_control
     set phase = 'rolling_out',
         heartbeat_at = now(),
         rollout_started_at = now(),
         updated_at = now()
   where singleton = true;
end;
$$;

create or replace function from_fed_to_chain.podcast_deployment_complete(
  p_deployment_id uuid,
  p_owner_token uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ops.lock_podcast_deployment_gate();
  update ops.podcast_deployment_control
     set phase = 'open',
         deployment_id = null,
         owner_token = null,
         target_release = null,
         heartbeat_at = null,
         rollout_started_at = null,
         recovery_reason = null,
         updated_at = now()
   where singleton = true
     and deployment_id = p_deployment_id
     and owner_token = p_owner_token
     and phase = 'rolling_out';
  if not found then
    raise exception using errcode = '55000', message = 'podcast deployment cannot be completed by this owner';
  end if;
end;
$$;

create or replace function from_fed_to_chain.podcast_deployment_fail(
  p_deployment_id uuid,
  p_owner_token uuid,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phase text;
begin
  perform ops.lock_podcast_deployment_gate();
  select phase into v_phase
    from ops.podcast_deployment_control
   where singleton = true
     and deployment_id = p_deployment_id
     and owner_token = p_owner_token
   for update;

  if v_phase is null then
    raise exception using errcode = '55000', message = 'podcast deployment fencing token is no longer current';
  end if;

  if v_phase = 'draining' then
    update ops.podcast_deployment_control
       set phase = 'open',
           deployment_id = null,
           owner_token = null,
           target_release = null,
           heartbeat_at = null,
           rollout_started_at = null,
           recovery_reason = null,
           updated_at = now()
     where singleton = true;
    return 'open';
  end if;

  update ops.podcast_deployment_control
     set phase = 'recovery_required',
         heartbeat_at = now(),
         recovery_reason = coalesce(nullif(btrim(p_reason), ''), 'rollout outcome unknown'),
         updated_at = now()
   where singleton = true;
  return 'recovery_required';
end;
$$;

create or replace function from_fed_to_chain.podcast_deployment_recover(
  p_deployment_id uuid,
  p_target_release text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ops.lock_podcast_deployment_gate();
  update ops.podcast_deployment_control
     set phase = 'open',
         deployment_id = null,
         owner_token = null,
         target_release = null,
         heartbeat_at = null,
         rollout_started_at = null,
         recovery_reason = null,
         updated_at = now()
   where singleton = true
     and deployment_id = p_deployment_id
     and target_release = btrim(p_target_release)
     and phase = 'recovery_required';
  if not found then
    raise exception using errcode = '55000', message = 'recovery target does not match the fenced deployment';
  end if;
end;
$$;

-- Keep the existing claim implementations intact and gate only their public
-- service-role boundary.  This makes the migration safe for workers from the
-- previous release: they still call the same RPC names, but get no new work
-- while CI is draining the fleet.
alter function from_fed_to_chain.claim_episode_video_v2(text, text)
  rename to claim_episode_video_v2_without_deployment_gate;

create function from_fed_to_chain.claim_episode_video_v2(
  p_lease_owner text,
  p_visual_version text
)
returns setof from_fed_to_chain.episode_videos
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ops.lock_podcast_deployment_gate();
  if not from_fed_to_chain.podcast_deployment_claims_open() then
    return;
  end if;
  return query
    select *
      from from_fed_to_chain.claim_episode_video_v2_without_deployment_gate(
        p_lease_owner,
        p_visual_version
      );
end;
$$;

alter function from_fed_to_chain.claim_episode_video_visual_v2(text, text)
  rename to claim_episode_video_visual_v2_without_deployment_gate;

create function from_fed_to_chain.claim_episode_video_visual_v2(
  p_lease_owner text,
  p_visual_version text
)
returns setof from_fed_to_chain.episode_video_visuals
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ops.lock_podcast_deployment_gate();
  if not from_fed_to_chain.podcast_deployment_claims_open() then
    return;
  end if;
  return query
    select *
      from from_fed_to_chain.claim_episode_video_visual_v2_without_deployment_gate(
        p_lease_owner,
        p_visual_version
      );
end;
$$;

revoke execute on function from_fed_to_chain.claim_episode_video_v2_without_deployment_gate(text, text)
  from public, anon, authenticated, service_role;
revoke execute on function from_fed_to_chain.claim_episode_video_visual_v2_without_deployment_gate(text, text)
  from public, anon, authenticated, service_role;
revoke execute on function from_fed_to_chain.claim_episode_video_v2(text, text)
  from public, anon, authenticated;
revoke execute on function from_fed_to_chain.claim_episode_video_visual_v2(text, text)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.claim_episode_video_v2(text, text) to service_role;
grant execute on function from_fed_to_chain.claim_episode_video_visual_v2(text, text) to service_role;

revoke execute on function from_fed_to_chain.podcast_deployment_claims_open()
  from public, anon, authenticated;
revoke execute on function from_fed_to_chain.podcast_deployment_state()
  from public, anon, authenticated;
revoke execute on function from_fed_to_chain.podcast_deployment_acquire(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function from_fed_to_chain.podcast_deployment_heartbeat(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function from_fed_to_chain.podcast_deployment_drain_status(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function from_fed_to_chain.podcast_deployment_mark_rollout(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function from_fed_to_chain.podcast_deployment_complete(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function from_fed_to_chain.podcast_deployment_fail(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function from_fed_to_chain.podcast_deployment_recover(uuid, text)
  from public, anon, authenticated;

grant execute on function from_fed_to_chain.podcast_deployment_claims_open() to service_role;
grant execute on function from_fed_to_chain.podcast_deployment_state() to service_role;
grant execute on function from_fed_to_chain.podcast_deployment_acquire(uuid, uuid, text) to service_role;
grant execute on function from_fed_to_chain.podcast_deployment_heartbeat(uuid, uuid) to service_role;
grant execute on function from_fed_to_chain.podcast_deployment_drain_status(uuid, uuid) to service_role;
grant execute on function from_fed_to_chain.podcast_deployment_mark_rollout(uuid, uuid) to service_role;
grant execute on function from_fed_to_chain.podcast_deployment_complete(uuid, uuid) to service_role;
grant execute on function from_fed_to_chain.podcast_deployment_fail(uuid, uuid, text) to service_role;
grant execute on function from_fed_to_chain.podcast_deployment_recover(uuid, text) to service_role;

notify pgrst, 'reload schema';

commit;
