begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- A Fly rollout sends SIGINT to the existing render Machine.  The render can
-- take tens of minutes, so the only safe rollout is one which first closes the
-- queue, lets the current lease finish, and only then replaces Machines.
--
-- This singleton is intentionally private.  CI and the runtime reach it only
-- through the narrow service-role RPCs below.  The owner token is a fencing
-- token: an older workflow can never heartbeat, transition, or reopen a gate
-- acquired by a newer workflow.
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

-- Execution lineage starts here.  Historical attempts are deliberately left
-- NULL: episode/language/stage equality is not enough evidence to call old
-- spend retry waste.  Each claim rotates the execution id and remembers the
-- previous id independently of attempt_count, which is known to reset.
alter table from_fed_to_chain.episode_videos
  add column if not exists execution_id uuid,
  add column if not exists previous_execution_id uuid;

alter table from_fed_to_chain.episode_video_visuals
  add column if not exists execution_id uuid,
  add column if not exists previous_execution_id uuid;

alter table ops.pipeline_stage_runs
  add column if not exists execution_id uuid,
  add column if not exists previous_execution_id uuid,
  add column if not exists work_key text,
  add column if not exists execution_mode text check (
    execution_mode is null or execution_mode in ('executed', 'reused')
  ),
  add column if not exists failure_reason text,
  add column if not exists deployment_id uuid;

create index if not exists idx_pipeline_stage_runs_execution
  on ops.pipeline_stage_runs (execution_id)
  where execution_id is not null;
create index if not exists idx_pipeline_stage_runs_previous_execution
  on ops.pipeline_stage_runs (previous_execution_id)
  where previous_execution_id is not null;
create index if not exists idx_pipeline_stage_runs_work_key
  on ops.pipeline_stage_runs (work_key)
  where work_key is not null;

-- Every claim and every gate transition takes the same transaction advisory
-- lock.  A claim that wins the lock first is allowed to finish normally; once
-- acquire wins, no later claim can pass the phase check.
create or replace function ops.lock_podcast_deployment_gate()
returns void
language sql
security invoker
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('zapengine:podcast-deployment-gate', 0));
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

revoke execute on function from_fed_to_chain.podcast_deployment_claims_open()
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.podcast_deployment_claims_open()
  to service_role;

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

revoke execute on function from_fed_to_chain.podcast_deployment_state()
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.podcast_deployment_state()
  to service_role;

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
  select state.phase into v_phase
    from ops.podcast_deployment_control state
   where state.singleton = true
   for update;

  if v_phase is distinct from 'open' then
    raise exception using
      errcode = '55000',
      message = format('podcast deployment gate is %s; another deployment or recovery owns it', coalesce(v_phase, 'missing'));
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
    select 1 from ops.podcast_deployment_control state
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
    select 1 from ops.podcast_deployment_control state
     where state.singleton = true
       and state.deployment_id = p_deployment_id
       and state.owner_token = p_owner_token
       and state.phase = 'draining'
  ) then
    raise exception using errcode = '55000', message = 'podcast deployment is not owned in draining phase';
  end if;

  select
    (select count(*) from from_fed_to_chain.episode_videos
      where status = 'processing' and lease_expires_at is not null and lease_expires_at > now())
    +
    (select count(*) from from_fed_to_chain.episode_video_visuals
      where status = 'processing' and lease_expires_at is not null and lease_expires_at > now())
  into v_active;

  if v_active <> 0 then
    raise exception using errcode = '55000', message = format('%s active render jobs remain; rollout blocked', v_active);
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
  select state.phase into v_phase
    from ops.podcast_deployment_control state
   where state.singleton = true
     and state.deployment_id = p_deployment_id
     and state.owner_token = p_owner_token
   for update;

  if v_phase is null then
    raise exception using errcode = '55000', message = 'podcast deployment fencing token is no longer current';
  end if;

  if v_phase = 'draining' then
    update ops.podcast_deployment_control
       set phase = 'open', deployment_id = null, owner_token = null,
           target_release = null, heartbeat_at = null,
           rollout_started_at = null, recovery_reason = null, updated_at = now()
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

-- Recovery intentionally does not inspect Fly from SQL.  The operator CLI must
-- first prove the rollout is no longer running and the fleet is converged, then
-- present the exact deployment id and target release here.  Heartbeat expiry is
-- never an automatic reopen signal.
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
     set phase = 'open', deployment_id = null, owner_token = null,
         target_release = null, heartbeat_at = null,
         rollout_started_at = null, recovery_reason = null, updated_at = now()
   where singleton = true
     and deployment_id = p_deployment_id
     and target_release = btrim(p_target_release)
     and phase = 'recovery_required';
  if not found then
    raise exception using errcode = '55000', message = 'recovery target does not match the fenced deployment';
  end if;
end;
$$;

-- Preserve the battle-tested claim implementations and put the deployment gate
-- at their public service-role boundary.  The advisory lock makes the claim
-- decision atomic with acquire/mark-rollout without copying their evolving
-- retry/recovery predicates into this migration.
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
declare
  v_job from_fed_to_chain.episode_videos%rowtype;
begin
  perform ops.lock_podcast_deployment_gate();
  if not from_fed_to_chain.podcast_deployment_claims_open() then
    return;
  end if;

  select * into v_job
    from from_fed_to_chain.claim_episode_video_v2_without_deployment_gate(
      p_lease_owner,
      p_visual_version
    )
   limit 1;
  if not found then return; end if;

  update from_fed_to_chain.episode_videos
     set previous_execution_id = execution_id,
         execution_id = gen_random_uuid()
   where episode_localization_id = v_job.episode_localization_id
   returning * into v_job;
  return next v_job;
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
declare
  v_job from_fed_to_chain.episode_video_visuals%rowtype;
begin
  perform ops.lock_podcast_deployment_gate();
  if not from_fed_to_chain.podcast_deployment_claims_open() then
    return;
  end if;

  select * into v_job
    from from_fed_to_chain.claim_episode_video_visual_v2_without_deployment_gate(
      p_lease_owner,
      p_visual_version
    )
   limit 1;
  if not found then return; end if;

  update from_fed_to_chain.episode_video_visuals
     set previous_execution_id = execution_id,
         execution_id = gen_random_uuid()
   where episode_id = v_job.episode_id
   returning * into v_job;
  return next v_job;
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
grant execute on function from_fed_to_chain.claim_episode_video_v2(text, text)
  to service_role;
grant execute on function from_fed_to_chain.claim_episode_video_visual_v2(text, text)
  to service_role;

-- Enrich new render/visual ledger rows with execution lineage without forcing
-- every existing writer to change in lockstep with the migration.  A later
-- execution whose previous_execution_id points at an earlier, same-work-key
-- execution is sufficient evidence to count the earlier priced work as
-- confirmed retry waste.
create or replace function ops.enrich_pipeline_execution_lineage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_execution uuid;
  v_previous uuid;
  v_visual_version text;
  v_input_hash text;
  v_last_error text;
  v_deployment uuid;
  v_phase text;
begin
  if new.stage <> 'video_render' then
    return new;
  end if;

  if new.localization_id is not null then
    select execution_id, previous_execution_id, visual_version,
           coalesce(script_hash, visual_hash, ''), last_error
      into v_execution, v_previous, v_visual_version, v_input_hash, v_last_error
      from from_fed_to_chain.episode_videos
     where episode_localization_id = new.localization_id;
    new.work_key := format(
      'video_render:%s:%s:%s',
      new.localization_id,
      coalesce(v_visual_version, 'unknown'),
      coalesce(v_input_hash, 'unknown')
    );
  else
    select execution_id, previous_execution_id, visual_version,
           coalesce(source_hash, ''), last_error
      into v_execution, v_previous, v_visual_version, v_input_hash, v_last_error
      from from_fed_to_chain.episode_video_visuals
     where episode_id = new.episode_id;
    new.work_key := format(
      'shared_visual:%s:%s:%s',
      new.episode_id,
      coalesce(v_visual_version, 'unknown'),
      coalesce(v_input_hash, 'unknown')
    );
  end if;

  new.execution_id := v_execution;
  new.previous_execution_id := v_previous;
  if v_execution is not null then
    new.execution_mode := 'executed';
  end if;

  if new.status = 'failed' and v_last_error like 'Video worker stopping:%' then
    select deployment_id, phase into v_deployment, v_phase
      from ops.podcast_deployment_control
     where singleton = true;
    if v_deployment is not null and v_phase in ('rolling_out', 'recovery_required') then
      new.failure_reason := 'deploy_shutdown';
      new.deployment_id := v_deployment;
    else
      new.failure_reason := 'shutdown';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function ops.enrich_pipeline_execution_lineage()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_pipeline_execution_lineage on ops.pipeline_stage_runs;
create trigger trg_pipeline_execution_lineage
before insert on ops.pipeline_stage_runs
for each row execute function ops.enrich_pipeline_execution_lineage();

create or replace view from_fed_to_chain.ops_pipeline_stage_runs
with (security_invoker = true) as
select
  id,
  run_id,
  episode_id,
  localization_id,
  language_code,
  stage,
  provider,
  model,
  attempt,
  status,
  started_at,
  finished_at,
  elapsed_ms,
  usage,
  estimated_cost_usd,
  pricing_basis,
  pricing_rate_id,
  execution_id,
  previous_execution_id,
  work_key,
  execution_mode,
  failure_reason,
  deployment_id,
  created_at
from ops.pipeline_stage_runs;

grant select on from_fed_to_chain.ops_pipeline_stage_runs to service_role;
revoke all on from_fed_to_chain.ops_pipeline_stage_runs from public, anon, authenticated;

for function_name in
  select unnest(array[
    'podcast_deployment_acquire(uuid,uuid,text)',
    'podcast_deployment_heartbeat(uuid,uuid)',
    'podcast_deployment_drain_status(uuid,uuid)',
    'podcast_deployment_mark_rollout(uuid,uuid)',
    'podcast_deployment_complete(uuid,uuid)',
    'podcast_deployment_fail(uuid,uuid,text)',
    'podcast_deployment_recover(uuid,text)'
  ])
loop
  -- Kept as a loop only to make the privilege intent visually explicit below;
  -- grants are issued with concrete signatures after this block.
  null;
end loop;

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

grant execute on function from_fed_to_chain.podcast_deployment_acquire(uuid, uuid, text) to service_role;
grant execute on function from_fed_to_chain.podcast_deployment_heartbeat(uuid, uuid) to service_role;
grant execute on function from_fed_to_chain.podcast_deployment_drain_status(uuid, uuid) to service_role;
grant execute on function from_fed_to_chain.podcast_deployment_mark_rollout(uuid, uuid) to service_role;
grant execute on function from_fed_to_chain.podcast_deployment_complete(uuid, uuid) to service_role;
grant execute on function from_fed_to_chain.podcast_deployment_fail(uuid, uuid, text) to service_role;
grant execute on function from_fed_to_chain.podcast_deployment_recover(uuid, text) to service_role;

notify pgrst, 'reload schema';

commit;
