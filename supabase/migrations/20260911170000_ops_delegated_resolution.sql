-- Operator-delegated Sentry resolution.
--
-- `ops_claim_resolution` gates an agent closing an issue on its *own* judgement:
-- a registered fix, a deployed runtime, and a fresh production verification. That
-- is the right bar for autonomous action and is left untouched.
--
-- It had no counterpart for the other legitimate case: a human reading an issue
-- and deciding it is dead history. With no such path, clearing a backlog of
-- already-abandoned or already-fixed issues was impossible through Ops MCP, which
-- pushed that work outside the audited rail entirely.
--
-- This adds that path as a separate, explicitly-labelled decision. It does not
-- weaken the verified path: the two write different `state`/`actor` values, so an
-- audit can always tell "production proved it" from "a person decided it". The
-- caller-side quiet-window check lives in Control Center, where Sentry is
-- reachable, and refuses any issue still producing events.
alter table ops.operator_incidents drop constraint operator_incidents_state_check;
alter table ops.operator_incidents add constraint operator_incidents_state_check
  check (state in ('diagnosed','fixed_pending_deploy','deployed_observing','verified','failed','blocked','needs_human','closed_by_operator'));

create function from_fed_to_chain.ops_claim_delegated_resolution(
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
    values('sentry:issues/'||p_issue_id,'closed_by_operator',p_actor,
      jsonb_build_object('issueId',p_issue_id),coalesce(p_evidence,'{}'),p_reason)
  on conflict (fingerprint) do update
    set state='closed_by_operator', actor=excluded.actor, evidence=excluded.evidence,
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

revoke all on function from_fed_to_chain.ops_claim_delegated_resolution(text,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function from_fed_to_chain.ops_claim_delegated_resolution(text,text,text,jsonb)
  to service_role;
