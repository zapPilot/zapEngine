begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table ops.metric_snapshots
  add column main_sha text check (main_sha is null or main_sha ~ '^[a-f0-9]{40}$'),
  add column version_context jsonb check (version_context is null or jsonb_typeof(version_context) = 'object');

comment on column ops.metric_snapshots.main_sha is
  'Observed main HEAD at collection time. Not an assertion of deployment or causality.';
comment on column ops.metric_snapshots.version_context is
  'Bounded GitHub production deployment attestations and explicit evidence gaps at collection time.';

create or replace view from_fed_to_chain.ops_metric_snapshots
with (security_invoker = true) as
select metric_key, snapshot_date, value, basis, fetched_at, main_sha, version_context
from ops.metric_snapshots;

drop function from_fed_to_chain.ops_upsert_metric_snapshot(text, date, numeric, text, timestamptz, timestamptz);
create function from_fed_to_chain.ops_upsert_metric_snapshot(
  p_metric_key text, p_snapshot_date date, p_value numeric, p_basis text,
  p_fetched_at timestamptz, p_updated_at timestamptz,
  p_main_sha text, p_version_context jsonb
) returns void
language sql security invoker set search_path = '' as $$
  insert into ops.metric_snapshots
    (metric_key, snapshot_date, value, basis, fetched_at, updated_at, main_sha, version_context)
  values
    (p_metric_key, p_snapshot_date, p_value, p_basis, p_fetched_at, p_updated_at, p_main_sha, p_version_context)
  on conflict (metric_key, snapshot_date) do update set
    value = excluded.value, basis = excluded.basis,
    fetched_at = excluded.fetched_at, updated_at = excluded.updated_at,
    main_sha = excluded.main_sha, version_context = excluded.version_context;
$$;
revoke all on function from_fed_to_chain.ops_upsert_metric_snapshot(text, date, numeric, text, timestamptz, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function from_fed_to_chain.ops_upsert_metric_snapshot(text, date, numeric, text, timestamptz, timestamptz, text, jsonb) to service_role;
revoke all on from_fed_to_chain.ops_metric_snapshots from public, anon, authenticated;
grant select on from_fed_to_chain.ops_metric_snapshots to service_role;
notify pgrst, 'reload schema';
commit;
