begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create schema if not exists ops;

create table if not exists ops.cost_rates (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('debank', 'openrouter', 'supabase', 'fly')),
  metric_key text not null,
  unit text not null,
  price_usd numeric(18, 8) not null check (price_usd >= 0),
  effective_from timestamptz not null,
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  note text,
  constraint cost_rates_effective_window_check check (
    effective_to is null or effective_to > effective_from
  ),
  constraint cost_rates_version_unique unique (provider, metric_key, effective_from)
);

create index if not exists idx_cost_rates_lookup
  on ops.cost_rates (provider, metric_key, effective_from desc);

create table if not exists ops.cost_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('debank', 'openrouter', 'supabase', 'fly')),
  snapshot_date date not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  accrued_cost_usd numeric(18, 8),
  projected_cost_usd numeric(18, 8),
  cost_type text not null check (
    cost_type in ('actual', 'estimated', 'fixed', 'list-price-equivalent')
  ),
  source text not null check (source in ('api', 'fixed', 'manual')),
  usage jsonb not null default '[]'::jsonb,
  pricing_rate_id uuid references ops.cost_rates(id) on delete restrict,
  fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cost_snapshots_period_check check (period_end >= period_start),
  constraint cost_snapshots_usage_is_array check (jsonb_typeof(usage) = 'array'),
  constraint cost_snapshots_provider_date_unique unique (provider, snapshot_date)
);

create index if not exists idx_cost_snapshots_period
  on ops.cost_snapshots (snapshot_date desc, provider);

create table if not exists ops.cost_transactions (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('debank', 'openrouter', 'supabase', 'fly')),
  amount_usd numeric(18, 8) not null check (amount_usd >= 0),
  charged_at timestamptz not null,
  kind text not null check (kind in ('subscription', 'top_up', 'invoice', 'adjustment')),
  source text not null,
  external_id text,
  description text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_cost_transactions_external_id
  on ops.cost_transactions (provider, external_id)
  where external_id is not null;
create index if not exists idx_cost_transactions_charged
  on ops.cost_transactions (charged_at desc, provider);

insert into ops.cost_rates (
  provider,
  metric_key,
  unit,
  price_usd,
  effective_from,
  note
)
values
  (
    'debank',
    'api_unit',
    'unit',
    0.0002,
    '2026-08-01T00:00:00Z',
    '$200 per 1,000,000 DeBank API units'
  ),
  (
    'supabase',
    'pro_plan',
    'month',
    25,
    '2026-08-01T00:00:00Z',
    'Supabase Pro monthly plan'
  )
on conflict (provider, metric_key, effective_from) do nothing;

alter table ops.cost_rates enable row level security;
alter table ops.cost_snapshots enable row level security;
alter table ops.cost_transactions enable row level security;

drop policy if exists "Service role can manage cost rates" on ops.cost_rates;
create policy "Service role can manage cost rates"
  on ops.cost_rates for all to service_role using (true) with check (true);

drop policy if exists "Service role can manage cost snapshots" on ops.cost_snapshots;
create policy "Service role can manage cost snapshots"
  on ops.cost_snapshots for all to service_role using (true) with check (true);

drop policy if exists "Service role can manage cost transactions" on ops.cost_transactions;
create policy "Service role can manage cost transactions"
  on ops.cost_transactions for all to service_role using (true) with check (true);

grant usage on schema ops to service_role;
grant all on ops.cost_rates to service_role;
grant all on ops.cost_snapshots to service_role;
grant all on ops.cost_transactions to service_role;

revoke all on schema ops from public, anon, authenticated;
revoke all on ops.cost_rates from public, anon, authenticated;
revoke all on ops.cost_snapshots from public, anon, authenticated;
revoke all on ops.cost_transactions from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
