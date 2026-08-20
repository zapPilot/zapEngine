-- Follower counts are the conversion signal this pipeline never collected.
-- `social_post_metrics.followers_gained` is per post and only YouTube can fill
-- it, so account-level growth had no home at all: a Rednote post that won five
-- followers looked identical to one that won none.
--
-- Point-in-time rows, never backfilled -- the same rule the metric windows
-- follow. A strategy version's effect is read as the delta across the period it
-- was active.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists from_fed_to_chain.social_account_snapshots (
  id uuid primary key default gen_random_uuid(),
  platform text not null
    constraint social_account_snapshots_platform_check
    check (platform in ('x', 'threads', 'rednote', 'youtube')),
  captured_at timestamptz not null default now(),
  followers integer not null check (followers >= 0),
  -- Provenance of a scraped number (the label text it was read from), so a
  -- parser reading the wrong figure is diagnosable after the fact.
  details jsonb not null default '{}'::jsonb,
  constraint social_account_snapshots_details_is_object check (
    jsonb_typeof(details) = 'object'
  )
);

create index if not exists idx_social_account_snapshots_platform_captured
  on from_fed_to_chain.social_account_snapshots (platform, captured_at desc);

alter table from_fed_to_chain.social_account_snapshots
  enable row level security;

drop policy if exists "Service role can manage social account snapshots"
  on from_fed_to_chain.social_account_snapshots;
create policy "Service role can manage social account snapshots"
  on from_fed_to_chain.social_account_snapshots for all to service_role
  using (true) with check (true);

grant all on from_fed_to_chain.social_account_snapshots to service_role;
revoke all on from_fed_to_chain.social_account_snapshots
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
