-- A measurement window must have a terminal outcome: a collected snapshot or an
-- explicit unavailable marker. Before this, a missing row meant "not yet"
-- and also "post not found / suppressed", so daemon retried the same window
-- every minute forever.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table from_fed_to_chain.social_post_metrics
  add column if not exists collection_status text not null default 'collected';

-- Backfill any pre-migration rows that somehow slipped past the default (e.g. manual inserts).
update from_fed_to_chain.social_post_metrics
  set collection_status = 'collected'
  where collection_status is distinct from 'collected'
    and collection_status is distinct from 'unavailable';

alter table from_fed_to_chain.social_post_metrics
  drop constraint if exists social_post_metrics_collection_status_check;

alter table from_fed_to_chain.social_post_metrics
  add constraint social_post_metrics_collection_status_check
  check (collection_status in ('collected', 'unavailable'));

notify pgrst, 'reload schema';

commit;
