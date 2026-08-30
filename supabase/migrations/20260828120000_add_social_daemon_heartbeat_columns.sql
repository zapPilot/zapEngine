begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- The social daemon runs on a laptop, outside every platform that could notice
-- it stopped: no Fly health check, no GitHub Actions run history, no queue
-- consumer that complains. `first_started_at` records only that it once ran,
-- so a machine that slept through a publish window is indistinguishable from
-- one that is healthy. These columns are the liveness evidence the Control
-- Center reads to tell those two apart.
--
-- Every column is nullable: the daemon writes them from a swallow-all
-- heartbeat, and a row that predates the first heartbeat must stay readable.
alter table "from_fed_to_chain"."social_daemon_state"
  add column if not exists "last_tick_started_at" timestamptz,
  add column if not exists "last_tick_completed_at" timestamptz,
  add column if not exists "last_success_at" timestamptz,
  add column if not exists "last_error" text,
  add column if not exists "owner" text,
  add column if not exists "daemon_version" text;

comment on column "from_fed_to_chain"."social_daemon_state"."last_tick_started_at"
  is 'Start of the most recent daemon tick. Staleness against now() is the liveness signal.';
comment on column "from_fed_to_chain"."social_daemon_state"."last_success_at"
  is 'Completion of the most recent tick that finished without a fatal error.';
comment on column "from_fed_to_chain"."social_daemon_state"."last_error"
  is 'Truncated message from the most recent fatal tick; cleared on the next success.';
comment on column "from_fed_to_chain"."social_daemon_state"."owner"
  is 'Host identity of the process that last wrote a heartbeat, so two laptops are distinguishable.';

notify pgrst, 'reload schema';

commit;
