begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  social_publish_job_id uuid
    references from_fed_to_chain.social_publish_jobs(id) on delete set null,
  cta_location text,
  landing_path text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  created_at timestamptz not null default now(),
  constraint waitlist_signups_email_normalized check (
    email = lower(btrim(email))
    and char_length(email) between 3 and 320
  ),
  constraint waitlist_signups_cta_location_length check (
    cta_location is null or char_length(cta_location) <= 64
  ),
  constraint waitlist_signups_landing_path_length check (
    landing_path is null or char_length(landing_path) <= 512
  ),
  constraint waitlist_signups_referrer_length check (
    referrer is null or char_length(referrer) <= 1024
  ),
  constraint waitlist_signups_utm_source_length check (
    utm_source is null or char_length(utm_source) <= 200
  ),
  constraint waitlist_signups_utm_medium_length check (
    utm_medium is null or char_length(utm_medium) <= 200
  ),
  constraint waitlist_signups_utm_campaign_length check (
    utm_campaign is null or char_length(utm_campaign) <= 200
  ),
  constraint waitlist_signups_utm_content_length check (
    utm_content is null or char_length(utm_content) <= 200
  ),
  unique (email)
);

create index if not exists idx_waitlist_signups_created_at
  on public.waitlist_signups (created_at desc);
create index if not exists idx_waitlist_signups_social_publish_job
  on public.waitlist_signups (social_publish_job_id)
  where social_publish_job_id is not null;

alter table public.waitlist_signups enable row level security;

drop policy if exists waitlist_signups_service_all
  on public.waitlist_signups;
create policy waitlist_signups_service_all
  on public.waitlist_signups for all to service_role
  using (true) with check (true);

grant all on public.waitlist_signups to service_role;
revoke all on public.waitlist_signups from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
