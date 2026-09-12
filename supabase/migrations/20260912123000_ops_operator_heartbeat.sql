begin;
set local lock_timeout = '5s';

create function from_fed_to_chain.ops_record_operator_heartbeat(p_actor text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if length(trim(p_actor)) not between 1 and 120 then
    raise exception 'Invalid operator heartbeat actor';
  end if;

  insert into ops.runtime_records(service, source, record_id, correlation)
  values (
    '@zapengine/control-center',
    'operator',
    'heartbeat',
    jsonb_build_object('actor', trim(p_actor))
  )
  on conflict(service, source, record_id) do update
    set correlation = excluded.correlation, observed_at = now();
end;
$$;

create function from_fed_to_chain.ops_operator_heartbeat()
returns jsonb language sql security definer set search_path = '' stable as $$
  select jsonb_build_object(
    'observedAt', observed_at,
    'actor', correlation ->> 'actor'
  )
  from ops.runtime_records
  where service = '@zapengine/control-center'
    and source = 'operator'
    and record_id = 'heartbeat';
$$;

revoke all on function from_fed_to_chain.ops_record_operator_heartbeat(text),
  from_fed_to_chain.ops_operator_heartbeat()
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.ops_record_operator_heartbeat(text),
  from_fed_to_chain.ops_operator_heartbeat()
  to service_role;

commit;
