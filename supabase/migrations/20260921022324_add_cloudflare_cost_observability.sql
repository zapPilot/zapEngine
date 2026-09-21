begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Cloudflare is a top-level operating-cost provider in Control Center. Unlike
-- the metered providers it needs no ops.cost_rates seed: the Billing API
-- reports what Cloudflare actually charged, so there is no list price for us
-- to keep in step with theirs. Fish Audio stays scoped to pipeline-stage
-- pricing: it has no daily cost snapshot.
alter table ops.cost_rates
  drop constraint if exists cost_rates_provider_check;
alter table ops.cost_rates
  add constraint cost_rates_provider_check check (
    provider in ('debank', 'openrouter', 'supabase', 'fly', 'fish-audio', 'brave', 'cloudflare')
  );

alter table ops.cost_snapshots
  drop constraint if exists cost_snapshots_provider_check;
alter table ops.cost_snapshots
  add constraint cost_snapshots_provider_check check (
    provider in ('debank', 'openrouter', 'supabase', 'fly', 'brave', 'cloudflare')
  );

alter table ops.cost_transactions
  drop constraint if exists cost_transactions_provider_check;
alter table ops.cost_transactions
  add constraint cost_transactions_provider_check check (
    provider in ('debank', 'openrouter', 'supabase', 'fly', 'brave', 'cloudflare')
  );

notify pgrst, 'reload schema';

commit;
