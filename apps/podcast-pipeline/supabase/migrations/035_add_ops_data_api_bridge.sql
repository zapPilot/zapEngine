begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Keep ops private from PostgREST. Control Center reaches it through a narrow,
-- service-role-only bridge in the already exposed from_fed_to_chain schema.
create or replace view from_fed_to_chain.ops_cost_rates
with (security_invoker = true) as
select
  id,
  provider,
  metric_key,
  unit,
  price_usd,
  effective_from,
  effective_to
from ops.cost_rates;

create or replace view from_fed_to_chain.ops_cost_snapshots
with (security_invoker = true) as
select
  provider,
  snapshot_date,
  period_start,
  period_end,
  accrued_cost_usd,
  projected_cost_usd,
  cost_type,
  source,
  usage,
  pricing_rate_id,
  fetched_at
from ops.cost_snapshots;

create or replace view from_fed_to_chain.ops_cost_transactions
with (security_invoker = true) as
select
  amount_usd,
  charged_at
from ops.cost_transactions;

create or replace function from_fed_to_chain.ops_upsert_cost_snapshot(
  p_provider text,
  p_snapshot_date date,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_accrued_cost_usd numeric,
  p_projected_cost_usd numeric,
  p_cost_type text,
  p_source text,
  p_usage jsonb,
  p_pricing_rate_id uuid,
  p_fetched_at timestamptz,
  p_updated_at timestamptz
)
returns void
language sql
set search_path = ''
as $$
  insert into ops.cost_snapshots (
    provider,
    snapshot_date,
    period_start,
    period_end,
    accrued_cost_usd,
    projected_cost_usd,
    cost_type,
    source,
    usage,
    pricing_rate_id,
    fetched_at,
    updated_at
  )
  values (
    p_provider,
    p_snapshot_date,
    p_period_start,
    p_period_end,
    p_accrued_cost_usd,
    p_projected_cost_usd,
    p_cost_type,
    p_source,
    p_usage,
    p_pricing_rate_id,
    p_fetched_at,
    p_updated_at
  )
  on conflict (provider, snapshot_date) do update set
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    accrued_cost_usd = excluded.accrued_cost_usd,
    projected_cost_usd = excluded.projected_cost_usd,
    cost_type = excluded.cost_type,
    source = excluded.source,
    usage = excluded.usage,
    pricing_rate_id = excluded.pricing_rate_id,
    fetched_at = excluded.fetched_at,
    updated_at = excluded.updated_at;
$$;

create or replace function from_fed_to_chain.ops_insert_cost_transaction(
  p_provider text,
  p_amount_usd numeric,
  p_charged_at timestamptz,
  p_kind text,
  p_source text,
  p_external_id text,
  p_description text
)
returns void
language sql
set search_path = ''
as $$
  insert into ops.cost_transactions (
    provider,
    amount_usd,
    charged_at,
    kind,
    source,
    external_id,
    description
  )
  values (
    p_provider,
    p_amount_usd,
    p_charged_at,
    p_kind,
    p_source,
    p_external_id,
    p_description
  );
$$;

grant select on from_fed_to_chain.ops_cost_rates to service_role;
grant select on from_fed_to_chain.ops_cost_snapshots to service_role;
grant select on from_fed_to_chain.ops_cost_transactions to service_role;
grant execute on function from_fed_to_chain.ops_upsert_cost_snapshot(
  text,
  date,
  timestamptz,
  timestamptz,
  numeric,
  numeric,
  text,
  text,
  jsonb,
  uuid,
  timestamptz,
  timestamptz
) to service_role;
grant execute on function from_fed_to_chain.ops_insert_cost_transaction(
  text,
  numeric,
  timestamptz,
  text,
  text,
  text,
  text
) to service_role;

revoke all on from_fed_to_chain.ops_cost_rates from public, anon, authenticated;
revoke all on from_fed_to_chain.ops_cost_snapshots from public, anon, authenticated;
revoke all on from_fed_to_chain.ops_cost_transactions from public, anon, authenticated;
revoke execute on function from_fed_to_chain.ops_upsert_cost_snapshot(
  text,
  date,
  timestamptz,
  timestamptz,
  numeric,
  numeric,
  text,
  text,
  jsonb,
  uuid,
  timestamptz,
  timestamptz
) from public, anon, authenticated;
revoke execute on function from_fed_to_chain.ops_insert_cost_transaction(
  text,
  numeric,
  timestamptz,
  text,
  text,
  text,
  text
) from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
