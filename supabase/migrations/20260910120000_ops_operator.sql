begin;
set local lock_timeout = '5s';
create table ops.operator_incidents (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  state text not null default 'diagnosed' check (state in ('diagnosed','fixed_pending_deploy','deployed_observing','verified','failed','blocked','needs_human')),
  actor text not null,
  correlation jsonb not null default '{}',
  evidence jsonb not null default '{}',
  decision text not null default '',
  updated_at timestamptz not null default now()
);
create table ops.operator_cycles (
  id uuid primary key,
  incident_id uuid not null references ops.operator_incidents,
  actor text not null,
  evidence jsonb not null,
  decision text not null,
  created_at timestamptz not null default now()
);
create table ops.operator_actions (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references ops.operator_incidents,
  cycle_id uuid not null references ops.operator_cycles,
  kind text not null,
  target text not null,
  tier integer not null check (tier between 0 and 4),
  state text not null check (state in ('requested','succeeded','failed','unknown')),
  authorization_evidence jsonb not null,
  result jsonb,
  created_at timestamptz not null default now(),
  unique (incident_id, kind)
);
create table ops.operator_verifications (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references ops.operator_incidents,
  verified boolean not null,
  evidence jsonb not null,
  blockers jsonb not null,
  created_at timestamptz not null default now()
);
create table ops.runtime_records (
  service text not null,
  source text not null,
  record_id text not null,
  observed_at timestamptz not null default now(),
  correlation jsonb not null,
  primary key (service, source, record_id)
);
alter table ops.operator_incidents enable row level security;
alter table ops.operator_cycles enable row level security;
alter table ops.operator_actions enable row level security;
alter table ops.operator_verifications enable row level security;
alter table ops.runtime_records enable row level security;
revoke all on ops.operator_incidents, ops.operator_cycles, ops.operator_actions,
  ops.operator_verifications, ops.runtime_records from public, anon, authenticated, service_role;

create function from_fed_to_chain.ops_record_runtime(p_service text, p_source text, p_record_id text, p_correlation jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_service <> '@zapengine/podcast-pipeline' or p_source not in ('render','social','sentry','fly','deploy','posthog','waitlist')
    or length(p_record_id) not between 1 and 160
    or jsonb_typeof(p_correlation) <> 'object' then raise exception 'Invalid runtime record'; end if;
  if exists (select 1 from jsonb_each_text(p_correlation) e where e.key not in
    ('episodeId','localizationId','renderJobId','publishJobId','deploymentId','gitSha','flyMachineId','sentryEventId','sentryIssueId','contentId','analyticsId','waitlistId')
    or length(e.value) not between 1 and 160 or e.value !~ '^[a-zA-Z0-9_.:/-]+$') then raise exception 'Invalid correlation metadata'; end if;
  insert into ops.runtime_records(service,source,record_id,correlation)
    values(p_service,p_source,p_record_id,p_correlation)
    on conflict(service,source,record_id) do update set correlation = excluded.correlation, observed_at=now();
end; $$;

create function from_fed_to_chain.ops_runtime_records(p_key text, p_value text)
returns jsonb language sql security definer set search_path = '' stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('service',service,'source',source,'recordId',record_id,
    'observedAt',observed_at,'correlation',correlation)), '[]')
  from (select * from ops.runtime_records where correlation ->> p_key = p_value
    order by observed_at desc limit 100) r;
$$;

create function from_fed_to_chain.ops_record_cycle(p_id uuid, p_fingerprint text, p_actor text, p_correlation jsonb, p_evidence jsonb, p_decision text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare incident uuid;
begin
  insert into ops.operator_incidents(fingerprint,actor,correlation,evidence,decision,state)
    values(p_fingerprint,p_actor,p_correlation,p_evidence,p_decision,case when p_evidence->'action'->>'allowed'='true' then 'diagnosed' else 'needs_human' end)
    on conflict(fingerprint) do update set evidence=excluded.evidence, decision=excluded.decision, actor=excluded.actor, updated_at=now()
    returning id into incident;
  insert into ops.operator_cycles(id,incident_id,actor,evidence,decision)
    values(p_id,incident,p_actor,p_evidence,p_decision) on conflict(id) do nothing;
  return incident;
end; $$;

create function from_fed_to_chain.ops_operator_history(p_fingerprint text default null)
returns jsonb language sql security definer set search_path = '' stable as $$
  select coalesce(jsonb_agg(to_jsonb(r)), '[]') from (
    select i.*, (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from ops.operator_actions a where a.incident_id=i.id) actions,
      (select to_jsonb(v) from ops.operator_verifications v where v.incident_id=i.id order by created_at desc limit 1) verification
    from ops.operator_incidents i where p_fingerprint is null or fingerprint=p_fingerprint
    order by updated_at desc limit 40) r;
$$;

-- This transaction owns both the one-repair budget and the existing queue RPC.
-- A lost HTTP response can safely be reconciled by reading the persisted result.
create function from_fed_to_chain.ops_retry_render(p_cycle_id uuid, p_episode_id uuid, p_localization_id uuid, p_visual_version text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare incident uuid; action_id uuid; existing jsonb; failure text;
begin
  select incident_id into strict incident from ops.operator_cycles where id=p_cycle_id;
  perform 1 from ops.operator_incidents where id=incident for update;
  select to_jsonb(a) into existing from ops.operator_actions a where incident_id=incident and kind='retry-render';
  if existing is not null then return existing; end if;
  if not exists (select 1 from ops.operator_incidents where id=incident
      and correlation->>'episodeId'=p_episode_id::text
      and correlation->>'localizationId'=p_localization_id::text) then raise exception 'Exact incident target is missing'; end if;
  insert into ops.operator_actions(incident_id,cycle_id,kind,target,tier,state,authorization_evidence)
    values(incident,p_cycle_id,'retry-render',p_localization_id::text,1,'requested',
      jsonb_build_object('policyVersion','ops-actions-v1','budget',1,'episodeId',p_episode_id)) returning id into action_id;
  begin
    perform ops.lock_podcast_deployment_gate();
    if not from_fed_to_chain.podcast_deployment_claims_open() then raise exception 'Deployment gate is closed'; end if;
    perform 1 from from_fed_to_chain.episode_videos where episode_localization_id=p_localization_id
      and episode_id=p_episode_id and status='failed'
      and (lease_expires_at is null or lease_expires_at<=now()) for update nowait;
    if not found then raise exception 'Render is not an unleased failed job'; end if;
    if not from_fed_to_chain.retry_episode_video_render(p_episode_id,p_localization_id,p_visual_version)
      then raise exception 'Retry was not accepted'; end if;
    update ops.operator_actions set state='succeeded',result='{"queued":true}' where id=action_id;
    update ops.operator_incidents set state='deployed_observing',decision='Retry accepted; production recovery is not yet verified',updated_at=now() where id=incident;
  exception when others then
    get stacked diagnostics failure = message_text;
    update ops.operator_actions set state='failed',result=jsonb_build_object('error',failure) where id=action_id;
    update ops.operator_incidents set state='needs_human',decision=failure,updated_at=now() where id=incident;
  end;
  select to_jsonb(a) into existing from ops.operator_actions a where id=action_id;
  return existing;
end; $$;

create function from_fed_to_chain.ops_record_verification(p_incident uuid, p_verified boolean, p_evidence jsonb, p_blockers jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_verified and not coalesce(
    p_evidence->>'policyVersion'='ops-verification-v1'
    and length(p_evidence->>'rootCause')>0
    and p_evidence->>'fixSha' ~ '^[a-f0-9]{40}$'
    and p_evidence->>'fixSha'=p_evidence->>'deployedSha'
    and length(p_evidence->>'deploymentId')>0 and length(p_evidence->>'release')>0
    and (p_evidence->>'minimumObservationSeconds')::integer=900
    and (p_evidence->>'observedUntil')::timestamptz <= now()
    and (p_evidence->>'observedUntil')::timestamptz >= (p_evidence->>'activeAt')::timestamptz+interval '15 minutes'
    and exists (select 1 from ops.operator_incidents i where i.id=p_incident
      and i.correlation->>'localizationId'=p_evidence->>'target')
    and not exists (select 1 from (values ('queue'),('runtime'),('sentry')) required(kind)
      where not exists (select 1 from jsonb_array_elements(p_evidence->'signals') signal
        where signal->>'kind'=required.kind and signal->>'status'='recovered'
        and signal->>'target'=p_evidence->>'target'
        and signal->>'deployedSha'=p_evidence->>'deployedSha'
        and (signal->>'from')::timestamptz <= (p_evidence->>'activeAt')::timestamptz
        and (signal->>'until')::timestamptz >= (p_evidence->>'observedUntil')::timestamptz))
    and p_blockers='[]'::jsonb, false) then raise exception 'Complete deploy-aware evidence is required'; end if;
  insert into ops.operator_verifications(incident_id,verified,evidence,blockers) values(p_incident,p_verified,p_evidence,p_blockers);
  update ops.operator_incidents set state=case when p_verified then 'verified' else 'blocked' end, updated_at=now() where id=p_incident;
end; $$;

revoke all on function from_fed_to_chain.ops_record_runtime(text,text,text,jsonb),
 from_fed_to_chain.ops_runtime_records(text,text), from_fed_to_chain.ops_record_cycle(uuid,text,text,jsonb,jsonb,text),
 from_fed_to_chain.ops_operator_history(text),from_fed_to_chain.ops_retry_render(uuid,uuid,uuid,text),
 from_fed_to_chain.ops_record_verification(uuid,boolean,jsonb,jsonb) from public, anon, authenticated;
grant execute on function from_fed_to_chain.ops_record_runtime(text,text,text,jsonb),
 from_fed_to_chain.ops_runtime_records(text,text), from_fed_to_chain.ops_record_cycle(uuid,text,text,jsonb,jsonb,text),
 from_fed_to_chain.ops_operator_history(text),from_fed_to_chain.ops_retry_render(uuid,uuid,uuid,text),
 from_fed_to_chain.ops_record_verification(uuid,boolean,jsonb,jsonb) to service_role;
create function from_fed_to_chain.ops_render_targets(p_localization_id uuid default null)
returns jsonb language sql security definer set search_path = '' stable as $$
  select coalesce(jsonb_agg(to_jsonb(r)), '[]') from (
    select v.episode_id as "episodeId", v.episode_localization_id as "localizationId",
      v.status as "renderStatus", v.completed_at as "renderCompletedAt", v.lease_expires_at as "renderLeaseExpiresAt",
      c.status as "visualStatus", c.visual_version as "visualVersion",
      from_fed_to_chain.podcast_deployment_claims_open() as "deploymentOpen"
    from from_fed_to_chain.episode_videos v
    left join from_fed_to_chain.episode_video_visuals c on c.episode_id=v.episode_id
    where p_localization_id is null or v.episode_localization_id=p_localization_id
    order by (v.status='failed') desc, v.updated_at desc limit 100) r;
$$;
revoke all on function from_fed_to_chain.ops_render_targets(uuid) from public,anon,authenticated;
grant execute on function from_fed_to_chain.ops_render_targets(uuid) to service_role;
create function ops.capture_queue_correlation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c jsonb; source_name text; record_key text;
begin
  if tg_table_name='episode_videos' then
    source_name := 'render'; record_key := new.episode_localization_id::text;
    c := jsonb_build_object('episodeId',new.episode_id,'localizationId',new.episode_localization_id,'renderJobId',new.episode_localization_id);
  else
    source_name := 'social'; record_key := new.id::text;
    c := jsonb_build_object('episodeId',new.episode_id,'publishJobId',new.id);
  end if;
  perform from_fed_to_chain.ops_record_runtime('@zapengine/podcast-pipeline',source_name,record_key,c);
  return new;
end; $$;
revoke all on function ops.capture_queue_correlation() from public,anon,authenticated,service_role;
create trigger ops_render_correlation after insert or update of status on from_fed_to_chain.episode_videos
 for each row execute function ops.capture_queue_correlation();
create trigger ops_social_correlation after insert or update of status on from_fed_to_chain.social_publish_jobs
 for each row execute function ops.capture_queue_correlation();
alter table ops.operator_incidents add column fix jsonb;
create function from_fed_to_chain.ops_register_fix(p_incident uuid,p_fix jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update ops.operator_incidents set fix=p_fix,state='fixed_pending_deploy',updated_at=now()
    where id=p_incident and correlation->>'localizationId'=p_fix->>'localizationId';
  if not found then raise exception 'Fix target does not match incident'; end if;
end; $$;
create function from_fed_to_chain.ops_claim_resolution(p_issue_id text,p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare incident uuid; cycle uuid := gen_random_uuid(); attempt uuid;
begin
  select i.id into incident from ops.operator_incidents i
    where i.fix->>'issueId'=p_issue_id and i.fix->>'authorizeResolve'='true' and i.state='verified'
    and exists (select 1 from ops.operator_verifications v where v.incident_id=i.id and v.verified
      and v.created_at>now()-interval '5 minutes'
      and v.id=(select latest.id from ops.operator_verifications latest where latest.incident_id=i.id order by latest.created_at desc limit 1))
    order by i.updated_at desc limit 1 for update;
  if incident is null then raise exception 'Fresh production verification and explicit resolution authorization are required'; end if;
  insert into ops.operator_cycles(id,incident_id,actor,evidence,decision)
    values(cycle,incident,'sentry-resolve','{}',p_reason);
  insert into ops.operator_actions(incident_id,cycle_id,kind,target,tier,state,authorization_evidence)
    values(incident,cycle,'resolve-sentry',p_issue_id,1,'requested','{"explicitAuthorization":true}') returning id into attempt;
  return attempt;
end; $$;
create function from_fed_to_chain.ops_finish_resolution(p_attempt uuid,p_state text,p_result jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_state not in ('succeeded','failed','unknown') then raise exception 'Invalid resolution outcome'; end if;
  update ops.operator_actions set state=p_state,result=p_result where id=p_attempt and kind='resolve-sentry' and state='requested';
end; $$;
revoke all on function from_fed_to_chain.ops_register_fix(uuid,jsonb),from_fed_to_chain.ops_claim_resolution(text,text),
 from_fed_to_chain.ops_finish_resolution(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function from_fed_to_chain.ops_register_fix(uuid,jsonb),from_fed_to_chain.ops_claim_resolution(text,text),
 from_fed_to_chain.ops_finish_resolution(uuid,text,jsonb) to service_role;
commit;
