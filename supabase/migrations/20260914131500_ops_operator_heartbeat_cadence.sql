begin;
set local lock_timeout = '5s';

-- Record schedule cadence provenance and diagnostic source/run correlation.
-- These fields do not establish authoritative execution identity.
create or replace function from_fed_to_chain.ops_record_operator_heartbeat_v2(
  p_actor text,
  p_state text,
  p_cadence_minutes integer,
  p_source_sha text default null,
  p_run_id text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  previous jsonb;
  failure_streak integer := 0;
begin
  if length(trim(p_actor)) not between 1 and 120 then
    raise exception 'Invalid operator heartbeat actor';
  end if;
  if p_state not in ('running', 'succeeded', 'failed') then
    raise exception 'Invalid operator heartbeat state';
  end if;
  if p_cadence_minutes is null or p_cadence_minutes <= 0 then
    raise exception 'Invalid operator heartbeat cadence';
  end if;

  select correlation into previous
  from ops.runtime_records
  where service = '@zapengine/control-center'
    and source = 'operator'
    and record_id = 'heartbeat'
  for update;

  failure_streak := coalesce((previous ->> 'failureStreak')::integer, 0);
  if p_state = 'succeeded' then
    failure_streak := 0;
  elsif p_state = 'failed' then
    failure_streak := failure_streak + 1;
  end if;

  insert into ops.runtime_records(service, source, record_id, correlation)
  values (
    '@zapengine/control-center',
    'operator',
    'heartbeat',
    jsonb_build_object(
      'actor', trim(p_actor),
      'state', p_state,
      'failureStreak', failure_streak,
      'cadenceMinutes', p_cadence_minutes,
      'sourceSha', nullif(trim(p_source_sha), ''),
      'runId', nullif(trim(p_run_id), '')
    )
  )
  on conflict(service, source, record_id) do update
    set correlation = excluded.correlation, observed_at = now();
end;
$$;

create or replace function from_fed_to_chain.ops_operator_heartbeat()
returns jsonb language sql security definer set search_path = '' stable as $$
  select jsonb_build_object(
    'observedAt', observed_at,
    'actor', correlation ->> 'actor',
    'state', correlation ->> 'state',
    'failureStreak', coalesce((correlation ->> 'failureStreak')::integer, 0),
    'cadenceMinutes', (correlation ->> 'cadenceMinutes')::integer,
    'sourceSha', correlation ->> 'sourceSha',
    'runId', correlation ->> 'runId'
  )
  from ops.runtime_records
  where service = '@zapengine/control-center'
    and source = 'operator'
    and record_id = 'heartbeat';
$$;

revoke all on function from_fed_to_chain.ops_record_operator_heartbeat_v2(text, text, integer, text, text)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.ops_record_operator_heartbeat_v2(text, text, integer, text, text)
  to service_role;

notify pgrst, 'reload schema';
commit;
