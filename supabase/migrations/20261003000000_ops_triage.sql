begin;
set local lock_timeout = '5s';

-- Assessments share the existing incident/cycle ledger. They cannot grant
-- repair authority or change deploy-aware verification state.
alter table ops.operator_incidents add column triage jsonb not null default '{}';

create function from_fed_to_chain.ops_record_triage(
  p_fingerprint text, p_actor text, p_assessment jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare incident uuid; target text; entry jsonb;
begin
  target := p_assessment->>'target';
  if p_fingerprint is null or length(p_fingerprint) not between 1 and 200
    or p_actor is null or length(p_actor) not between 1 and 120
    or target is null or length(target) not between 1 and 200
    or jsonb_typeof(p_assessment) is distinct from 'object'
    or coalesce(p_assessment->>'classification','') not in ('engineering','owner','external','insufficient_evidence')
    or coalesce(p_assessment->>'stage','') not in ('investigating','repair_pending','pr_open','awaiting_deploy','observing','closure_pending','blocked')
    or coalesce(length(p_assessment->>'reason'),0) not between 8 and 2000
    or coalesce(length(p_assessment->>'nextAction'),0) not between 8 and 1000
    or jsonb_typeof(p_assessment->'evidence') is distinct from 'array'
    or coalesce(p_assessment->>'reviewAfter','') = ''
  then raise exception 'Invalid triage assessment'; end if;
  if jsonb_array_length(p_assessment->'evidence') not between 1 and 20
    then raise exception 'Triage evidence is required'; end if;
  if exists (select 1 from jsonb_array_elements(p_assessment->'evidence') e
    where jsonb_typeof(e) <> 'string' or length(e #>> '{}') not between 1 and 500)
    then raise exception 'Invalid triage evidence'; end if;
  if not (p_assessment ?& array['prNumber','fixSha','lastSeen'])
    then raise exception 'Triage identity fields are required'; end if;
  if p_assessment->>'prNumber' is not null and (p_assessment->>'prNumber' !~ '^[1-9][0-9]*$'
    or jsonb_typeof(p_assessment->'prNumber') <> 'number')
    then raise exception 'Invalid triage PR'; end if;
  if p_assessment->>'fixSha' is not null and p_assessment->>'fixSha' !~ '^[a-f0-9]{40}$'
    then raise exception 'Invalid triage fix commit'; end if;
  if p_assessment->>'stage' in ('pr_open','awaiting_deploy','observing','closure_pending')
    and p_assessment->>'prNumber' is null then raise exception 'Repair progress requires a linked PR'; end if;
  if p_assessment->>'stage' in ('awaiting_deploy','observing','closure_pending')
    and p_assessment->>'fixSha' is null then raise exception 'Deployment tracking requires the exact fix commit'; end if;
  if p_fingerprint ~ '^sentry:(issues|stale-unresolved)/' and target !~ '^[0-9]+$'
    then raise exception 'Sentry triage requires an exact issue ID'; end if;
  perform (p_assessment->>'reviewAfter')::timestamptz;
  perform (p_assessment->>'lastSeen')::timestamptz;
  entry := jsonb_build_object('fingerprint',p_fingerprint,'actor',p_actor,
    'assessment',p_assessment,'recordedAt',now());
  insert into ops.operator_incidents(fingerprint,actor,decision,state,triage)
    values(p_fingerprint,p_actor,p_assessment->>'reason','diagnosed',jsonb_build_object(target,entry))
    on conflict(fingerprint) do update set triage=ops.operator_incidents.triage || excluded.triage
    returning id into incident;
  insert into ops.operator_cycles(id,incident_id,actor,evidence,decision)
    values(gen_random_uuid(),incident,p_actor,jsonb_build_object('triage',entry),p_assessment->>'reason');
  return incident;
end; $$;

create function from_fed_to_chain.ops_triage_history(p_fingerprints text[])
returns jsonb language sql security definer set search_path = '' stable as $$
  select coalesce(jsonb_agg(entry.value),'[]'::jsonb)
  from ops.operator_incidents i cross join lateral jsonb_each(i.triage) entry
  where i.fingerprint = any(p_fingerprints);
$$;
revoke all on function from_fed_to_chain.ops_record_triage(text,text,jsonb),
  from_fed_to_chain.ops_triage_history(text[]) from public,anon,authenticated;
grant execute on function from_fed_to_chain.ops_record_triage(text,text,jsonb),
  from_fed_to_chain.ops_triage_history(text[]) to service_role;
create or replace function from_fed_to_chain.ops_claim_delegated_resolution(
  p_issue_id text, p_reason text, p_actor text, p_evidence jsonb default '{}'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare incident uuid; cycle uuid := gen_random_uuid(); attempt uuid;
begin
  if coalesce(btrim(p_actor),'') = '' then
    raise exception 'Delegated resolution requires the delegating actor';
  end if;
  if coalesce(btrim(p_reason),'') = '' then
    raise exception 'Delegated resolution requires a reason';
  end if;

  insert into ops.operator_incidents(fingerprint,state,actor,correlation,evidence,decision)
    values('sentry:issues/'||p_issue_id,'needs_human',p_actor,
      jsonb_build_object('issueId',p_issue_id),coalesce(p_evidence,'{}'),p_reason)
  on conflict (fingerprint) do update
    set state='needs_human', actor=excluded.actor, evidence=excluded.evidence,
        decision=excluded.decision, updated_at=now()
  returning id into incident;

  insert into ops.operator_cycles(id,incident_id,actor,evidence,decision)
    values(cycle,incident,'operator-delegated',coalesce(p_evidence,'{}'),p_reason);

  begin
    insert into ops.operator_actions(incident_id,cycle_id,kind,target,tier,state,authorization_evidence)
      values(incident,cycle,'resolve-sentry',p_issue_id,1,'requested',
        jsonb_build_object('explicitAuthorization',true,'delegatedBy',p_actor) || coalesce(p_evidence,'{}'))
    returning id into attempt;
  exception when unique_violation then
    raise exception 'Issue % already has a recorded resolution attempt', p_issue_id;
  end;

  return attempt;
end; $$;

create or replace function from_fed_to_chain.ops_finish_resolution(p_attempt uuid,p_state text,p_result jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare incident uuid; delegated boolean;
begin
  if p_state not in ('succeeded','failed','unknown') then raise exception 'Invalid resolution outcome'; end if;
  update ops.operator_actions set state=p_state,result=p_result
    where id=p_attempt and kind='resolve-sentry' and state='requested'
    returning incident_id,authorization_evidence ? 'delegatedBy' into incident,delegated;
  if delegated then
    update ops.operator_incidents set state=case when p_state='succeeded' then 'closed_by_operator' else 'blocked' end,
      updated_at=now() where id=incident;
  end if;
end; $$;
create function from_fed_to_chain.ops_reconcile_resolution(p_issue_id text,p_evidence jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare action_row record; reconciled boolean := false;
begin
  if p_issue_id is null or p_issue_id !~ '^[0-9]+$'
    or p_evidence->>'id' is distinct from p_issue_id
    or p_evidence->>'status' is distinct from 'resolved'
    then raise exception 'Exact provider-confirmed resolution is required'; end if;
  for action_row in
    update ops.operator_actions set state='succeeded',result=jsonb_build_object('reconciled',true,'providerEvidence',p_evidence)
    where kind='resolve-sentry' and target=p_issue_id and state in ('requested','unknown')
    returning incident_id,authorization_evidence
  loop
    reconciled := true;
    if action_row.authorization_evidence ? 'delegatedBy' then
      update ops.operator_incidents set state='closed_by_operator',updated_at=now()
        where id=action_row.incident_id;
    end if;
  end loop;
  return reconciled;
end; $$;
revoke all on function from_fed_to_chain.ops_reconcile_resolution(text,jsonb) from public,anon,authenticated;
grant execute on function from_fed_to_chain.ops_reconcile_resolution(text,jsonb) to service_role;
commit;
