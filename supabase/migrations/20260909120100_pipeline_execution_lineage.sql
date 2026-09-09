begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- attempt_count is scheduling state, not a durable execution identity.  It can
-- reset on manual recovery, so every actual claim gets a fresh execution id and
-- remembers the execution it superseded.
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

-- Replace the gate wrappers from the immediately preceding migration so the
-- execution id is assigned in the same transaction as the successful claim.
create or replace function from_fed_to_chain.claim_episode_video_v2(
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

create or replace function from_fed_to_chain.claim_episode_video_visual_v2(
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

-- Existing writers can stay unchanged.  When a new video/visual stage row is
-- inserted, enrich it from the durable claimed-job row.  Historical rows stay
-- NULL and therefore remain unknown rather than being guessed into confirmed
-- retry waste.
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
    select deployment_id, phase
      into v_deployment, v_phase
      from ops.podcast_deployment_control
     where singleton = true;
    if v_deployment is not null
       and v_phase in ('rolling_out', 'recovery_required') then
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
revoke all on from_fed_to_chain.ops_pipeline_stage_runs
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
