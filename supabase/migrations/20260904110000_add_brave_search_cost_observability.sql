begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Brave Search is a top-level operating-cost provider in Control Center. Keep
-- Fish Audio scoped to pipeline-stage pricing: it has no daily cost snapshot.
alter table ops.cost_rates
  drop constraint if exists cost_rates_provider_check;
alter table ops.cost_rates
  add constraint cost_rates_provider_check check (
    provider in ('debank', 'openrouter', 'supabase', 'fly', 'fish-audio', 'brave')
  );

alter table ops.cost_snapshots
  drop constraint if exists cost_snapshots_provider_check;
alter table ops.cost_snapshots
  add constraint cost_snapshots_provider_check check (
    provider in ('debank', 'openrouter', 'supabase', 'fly', 'brave')
  );

alter table ops.cost_transactions
  drop constraint if exists cost_transactions_provider_check;
alter table ops.cost_transactions
  add constraint cost_transactions_provider_check check (
    provider in ('debank', 'openrouter', 'supabase', 'fly', 'brave')
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
  'brave',
  'search_request',
  'request',
  0.005,
  '2026-09-01T00:00:00Z',
  null,
  'Brave Search API: $5 per 1,000 successful Search requests; the monthly promotional credit is surfaced separately from gross usage-equivalent cost'
)
on conflict (provider, metric_key, effective_from) do nothing;

notify pgrst, 'reload schema';

commit;
