begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- 20260830065000 was expanded after production had already applied its original
-- 14-line data correction. Keep that immutable migration equal to the SQL that
-- actually ran and apply the later Fish Audio rate-card work here instead.
alter table ops.cost_rates
  drop constraint if exists cost_rates_provider_check;
alter table ops.cost_rates
  add constraint cost_rates_provider_check check (
    provider in ('debank', 'openrouter', 'supabase', 'fly', 'fish-audio')
  );

insert into ops.cost_rates (
  provider,
  metric_key,
  unit,
  price_usd,
  effective_from,
  effective_to,
  note
)
values (
  'fish-audio',
  'tts_s2.1-pro-free_utf8_byte',
  'utf8_byte',
  0,
  '2026-08-27T00:00:00Z',
  '2026-09-01T00:00:00Z',
  'Fish s2.1-pro-free developer-free period; first pipeline ledger usage observed 2026-08-27, offer published through 2026-08-31'
)
on conflict (provider, metric_key, effective_from) do nothing;

create or replace function ops.apply_fish_audio_pipeline_rate_card()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_rate_id uuid;
  v_price_usd numeric;
  v_at timestamptz;
  v_quantity numeric;
begin
  if new.provider <> 'fish-audio'
     or new.model is null
     or new.usage ->> 'unit' <> 'utf8_bytes' then
    return new;
  end if;

  v_at := coalesce(new.started_at, new.created_at, now());
  v_quantity := coalesce((new.usage ->> 'quantity')::numeric, 0);

  select rates.id, rates.price_usd
  into v_rate_id, v_price_usd
  from ops.cost_rates as rates
  where rates.provider = 'fish-audio'
    and rates.metric_key = 'tts_' || new.model || '_utf8_byte'
    and rates.effective_from <= v_at
    and (rates.effective_to is null or rates.effective_to > v_at)
  order by rates.effective_from desc
  limit 1;

  if v_rate_id is null then
    new.estimated_cost_usd := null;
    new.pricing_basis := 'unpriced';
    new.pricing_rate_id := null;
    return new;
  end if;

  new.estimated_cost_usd := v_price_usd * v_quantity;
  new.pricing_basis := 'rate_card';
  new.pricing_rate_id := v_rate_id;
  new.usage := jsonb_set(
    new.usage,
    '{unitPriceUsd}',
    to_jsonb(v_price_usd),
    true
  );
  return new;
end;
$$;

drop trigger if exists apply_fish_audio_pipeline_rate_card
  on ops.pipeline_stage_runs;
create trigger apply_fish_audio_pipeline_rate_card
before insert on ops.pipeline_stage_runs
for each row
execute function ops.apply_fish_audio_pipeline_rate_card();

with free_rate as (
  select id, price_usd
  from ops.cost_rates
  where provider = 'fish-audio'
    and metric_key = 'tts_s2.1-pro-free_utf8_byte'
    and effective_from = '2026-08-27T00:00:00Z'
  limit 1
)
update ops.pipeline_stage_runs as stage
set
  estimated_cost_usd = free_rate.price_usd * coalesce(
    (stage.usage ->> 'quantity')::numeric,
    0
  ),
  usage = jsonb_set(
    stage.usage,
    '{unitPriceUsd}',
    to_jsonb(free_rate.price_usd),
    true
  ),
  pricing_basis = 'rate_card',
  pricing_rate_id = free_rate.id
from free_rate
where stage.provider = 'fish-audio'
  and stage.model = 's2.1-pro-free';

-- Production history contains 20260902060000, but its objects are absent. The
-- definitions below are intentionally idempotent: clean databases already have
-- them from that migration, while the drifted production database is repaired
-- by this new, honestly tracked migration.
create table if not exists ops.metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  metric_key text not null,
  snapshot_date date not null,
  value numeric(18, 4),
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
