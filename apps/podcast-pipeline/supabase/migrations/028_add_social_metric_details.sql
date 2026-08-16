begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table from_fed_to_chain.social_post_metrics
  add column if not exists details jsonb not null default '{}'::jsonb;

alter table from_fed_to_chain.social_post_metrics
  drop constraint if exists social_post_metrics_details_is_object;

alter table from_fed_to_chain.social_post_metrics
  add constraint social_post_metrics_details_is_object check (
    jsonb_typeof(details) = 'object'
  );

notify pgrst, 'reload schema';

commit;
