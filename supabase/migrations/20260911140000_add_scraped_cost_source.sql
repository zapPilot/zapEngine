begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Fly publishes no billing API, so the month-to-date figure has always reached
-- this table by an operator reading the dashboard and typing it in as
-- `source = 'manual'`. A browser session on the operator's own machine can now
-- read the same page unattended, and that reading needs its own source: it is
-- a recorded bill like the typed one -- not a run-rate -- but it was not
-- vouched for by a human, and `costBasisLabel` has to be able to say which.
alter table ops.cost_snapshots
  drop constraint if exists cost_snapshots_source_check;
alter table ops.cost_snapshots
  add constraint cost_snapshots_source_check check (
    source in ('api', 'fixed', 'manual', 'scraped')
  );

notify pgrst, 'reload schema';

commit;
