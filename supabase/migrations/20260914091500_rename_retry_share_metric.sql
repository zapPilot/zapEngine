begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- `retry_share` was Σ failed-parent stage cost / Σ episode cost: a
-- failed-attempt share, never confirmed retry waste. The Control Center sync
-- now writes the honest key, so the existing rows move with it — a rename
-- without this leaves the series cut at the deploy and starts a new one.
-- The guard only matters if the new sync ran before this migration did: a row
-- already written under the new key is a measurement, so the stale one is left
-- in place rather than overwriting it.
update ops.metric_snapshots
   set metric_key = 'failed_attempt_share', updated_at = now()
 where metric_key = 'retry_share'
   and not exists (
     select 1 from ops.metric_snapshots renamed
      where renamed.metric_key = 'failed_attempt_share'
        and renamed.snapshot_date = metric_snapshots.snapshot_date
   );

commit;
