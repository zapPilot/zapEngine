begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Daily point-in-time readings for the Control Center's Statement/Sparkline
-- redesign: every headline number needs its own 30-day history and Δ7d, and
-- none of it is persisted anywhere today (see apps/control-center's
-- ops.cost_snapshots for the precedent this mirrors). One row per
-- (metric_key, snapshot_date); `ops-cost-sync` (the existing 04:30 UTC
-- workflow) writes it alongside the cost snapshots it already persists.
create table if not exists ops.metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  metric_key text not null,
  snapshot_date date not null,
  value numeric(18, 4),
  -- 'measured' = read directly from its source this run; 'derived' = computed
  -- from other measured values (e.g. a ratio or a share). Never invented.
  basis text not null default 'measured' check (basis in ('measured', 'derived')),
  fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint metric_snapshots_key_date_unique unique (metric_key, snapshot_date)
);

create index if not exists idx_metric_snapshots_lookup
  on ops.metric_snapshots (metric_key, snapshot_date desc);

alter table ops.metric_snapshots enable row level security;

drop policy if exists "Service role can manage metric snapshots" on ops.metric_snapshots;
create policy "Service role can manage metric snapshots"
  on ops.metric_snapshots for all to service_role using (true) with check (true);

grant all on ops.metric_snapshots to service_role;

revoke all on ops.metric_snapshots from public, anon, authenticated;

-- Keep ops private from PostgREST; reach it through the same narrow,
-- service-role-only bridge apps/control-center already uses for
-- ops_cost_snapshots (see migration 035_add_ops_data_api_bridge.sql).
create or replace view from_fed_to_chain.ops_metric_snapshots
with (security_invoker = true) as
select
  metric_key,
  snapshot_date,
  value,
  basis,
  fetched_at
from ops.metric_snapshots;

create or replace function from_fed_to_chain.ops_upsert_metric_snapshot(
  p_metric_key text,
  p_snapshot_date date,
  p_value numeric,
  p_basis text,
  p_fetched_at timestamptz,
  p_updated_at timestamptz
)
returns void
language sql
set search_path = ''
as $$
  insert into ops.metric_snapshots (
    metric_key,
    snapshot_date,
    value,
    basis,
    fetched_at,
    updated_at
  )
  values (
    p_metric_key,
    p_snapshot_date,
    p_value,
    p_basis,
    p_fetched_at,
    p_updated_at
  )
  on conflict (metric_key, snapshot_date) do update set
    value = excluded.value,
    basis = excluded.basis,
    fetched_at = excluded.fetched_at,
    updated_at = excluded.updated_at;
$$;

grant select on from_fed_to_chain.ops_metric_snapshots to service_role;
grant execute on function from_fed_to_chain.ops_upsert_metric_snapshot(
  text,
  date,
  numeric,
  text,
  timestamptz,
  timestamptz
) to service_role;

revoke all on from_fed_to_chain.ops_metric_snapshots from public, anon, authenticated;
revoke execute on function from_fed_to_chain.ops_upsert_metric_snapshot(
  text,
  date,
  numeric,
  text,
  timestamptz,
  timestamptz
) from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
