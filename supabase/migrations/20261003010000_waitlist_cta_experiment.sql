begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Nullable for historical/non-experiment signups. Email remains first-touch/idempotent.
alter table public.waitlist_signups
  add column cta_experiment_key text,
  add column cta_experiment_variant text,
  add column cta_exposure_id uuid,
  add constraint waitlist_cta_experiment_context check (
    (cta_experiment_key is null and cta_experiment_variant is null and cta_exposure_id is null)
    or (cta_experiment_key is not null and cta_experiment_variant is not null and cta_exposure_id is not null
      and cta_experiment_key = 'landing-waitlist-cta-v2'
      and cta_experiment_variant in ('baseline', 'control', 'value_first'))
  );
create index idx_waitlist_cta_experiment_created
  on public.waitlist_signups (cta_experiment_key, created_at)
  where cta_experiment_key is not null;

notify pgrst, 'reload schema';
commit;
