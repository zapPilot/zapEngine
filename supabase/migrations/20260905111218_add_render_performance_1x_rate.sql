begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- The render process group moves from performance-2x/4 GB to performance-1x/
-- 2 GB (apps/podcast-pipeline/fly.toml). Thirty days of ops ledger rows showed
-- a solo render using roughly 1.6 of the two cores and peaking at 1908 MB of
-- cgroup memory, most of it reclaimable page cache — so one vCPU costs about
-- the same per finished video and halves what a stuck machine can burn.
--
-- A different shape is a different metric key, so this is an insert and not an
-- edit: `machine_second_performance_2x_4gb` prices every render already in the
-- ledger and must keep doing so. That row also stays *open* rather than having
-- its effective_to closed. Migrations deploy before the Fly release that uses
-- the new key (ci.yml: deploy-fly needs deploy-supabase-migrations), so for the
-- length of the deploy window renders are still reporting the 2x key; closing
-- it would price those at NULL. Only a price change to the *same* shape closes
-- a row and opens another.
--
-- effective_from is deliberately a fixed past instant rather than now(): it
-- makes the row idempotent under the conflict clause below, and it cannot
-- reprice history because no render reported this key before this deploy.
--
-- $0.00001242/s is Fly's iad list price for performance-1x with 2 GB
-- ($32.19/month), per fly.io/docs/about/pricing as of 2026-09-05.
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
  'fly',
  'machine_second_performance_1x_2gb',
  'second',
  0.00001242,
  '2026-09-01T00:00:00Z',
  null,
  'Fly iad list price for performance-1x with 2 GB: $32.19 / month / 730 h / 3600 s; fly.io/docs/about/pricing, 2026-09-05'
)
on conflict (provider, metric_key, effective_from) do nothing;

notify pgrst, 'reload schema';

commit;
