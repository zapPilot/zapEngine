begin;

create extension if not exists pgcrypto;
create schema if not exists from_fed_to_chain;

do $$
begin
  if to_regclass('from_fed_to_chain.episodes') is null
     and to_regclass('public.episodes') is not null then
    execute 'alter table public.episodes set schema from_fed_to_chain';
  end if;
end $$;

create table if not exists from_fed_to_chain.episodes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_url text not null unique,
  hls_url text not null default '',
  raw_text text,
  script text,
  llm_model text,
  llm_thinking_model text,
  llm_provider text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  listened boolean not null default false
);

alter table from_fed_to_chain.episodes add column if not exists llm_model text;
alter table from_fed_to_chain.episodes add column if not exists llm_thinking_model text;
alter table from_fed_to_chain.episodes add column if not exists llm_provider text;
alter table from_fed_to_chain.episodes add column if not exists status text;
alter table from_fed_to_chain.episodes add column if not exists listened boolean;
alter table from_fed_to_chain.episodes add column if not exists hls_url text;

update from_fed_to_chain.episodes set status = 'pending' where status is null;
update from_fed_to_chain.episodes set listened = false where listened is null;
update from_fed_to_chain.episodes set hls_url = '' where hls_url is null;

alter table from_fed_to_chain.episodes
  alter column status set default 'pending',
  alter column status set not null,
  alter column listened set default false,
  alter column listened set not null,
  alter column hls_url set default '',
  alter column hls_url set not null;

alter table from_fed_to_chain.episodes drop constraint if exists episodes_status_check;
alter table from_fed_to_chain.episodes
  add constraint episodes_status_check
  check (status in ('pending', 'scraped', 'script_generated', 'audio_generated', 'completed'));

create unique index if not exists episodes_source_url_key
  on from_fed_to_chain.episodes (source_url);
create index if not exists idx_episodes_created_at
  on from_fed_to_chain.episodes (created_at desc);
create index if not exists idx_episodes_created_at_id
  on from_fed_to_chain.episodes (created_at desc, id desc);

create table if not exists from_fed_to_chain.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  device_id text unique,
  display_name text,
  created_at timestamptz default now()
);

create unique index if not exists idx_users_device_id_unique
  on from_fed_to_chain.users (device_id)
  where device_id is not null;

create table if not exists from_fed_to_chain.likes (
  user_id uuid references from_fed_to_chain.users(id) on delete cascade,
  episode_id uuid references from_fed_to_chain.episodes(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, episode_id)
);

create index if not exists idx_likes_episode
  on from_fed_to_chain.likes (episode_id);

create table if not exists from_fed_to_chain.user_episode_state (
  user_id uuid references from_fed_to_chain.users(id) on delete cascade,
  episode_id uuid references from_fed_to_chain.episodes(id) on delete cascade,
  listened boolean default false,
  last_position_seconds int default 0,
  updated_at timestamptz default now(),
  primary key (user_id, episode_id)
);

create or replace view from_fed_to_chain.episodes_with_stats
with (security_invoker = true) as
select e.*,
       coalesce(l.like_count, 0)::int as like_count
from from_fed_to_chain.episodes e
left join (
  select episode_id, count(*) as like_count
  from from_fed_to_chain.likes
  group by episode_id
) l on l.episode_id = e.id
where e.status = 'completed'
  and e.hls_url <> '';

alter table from_fed_to_chain.episodes enable row level security;
alter table from_fed_to_chain.users enable row level security;
alter table from_fed_to_chain.likes enable row level security;
alter table from_fed_to_chain.user_episode_state enable row level security;

drop policy if exists "Service role can manage episodes" on from_fed_to_chain.episodes;
create policy "Service role can manage episodes"
  on from_fed_to_chain.episodes for all to service_role
  using (true) with check (true);

drop policy if exists "anon read completed podcast episodes" on from_fed_to_chain.episodes;
create policy "anon read completed podcast episodes"
  on from_fed_to_chain.episodes for select to anon, authenticated
  using (status = 'completed' and hls_url <> '');

drop policy if exists "anon read podcast users" on from_fed_to_chain.users;
create policy "anon read podcast users"
  on from_fed_to_chain.users for select to anon, authenticated
  using (device_id is not null or display_name = 'From Fed to Chain listener');

drop policy if exists "anon insert podcast users" on from_fed_to_chain.users;
create policy "anon insert podcast users"
  on from_fed_to_chain.users for insert to anon, authenticated
  with check (device_id is not null or display_name = 'From Fed to Chain listener');

drop policy if exists "anon update podcast users" on from_fed_to_chain.users;
create policy "anon update podcast users"
  on from_fed_to_chain.users for update to anon, authenticated
  using (device_id is not null or display_name = 'From Fed to Chain listener')
  with check (device_id is not null or display_name = 'From Fed to Chain listener');

drop policy if exists "anon read likes" on from_fed_to_chain.likes;
create policy "anon read likes"
  on from_fed_to_chain.likes for select to anon, authenticated
  using (true);

drop policy if exists "anon insert likes" on from_fed_to_chain.likes;
create policy "anon insert likes"
  on from_fed_to_chain.likes for insert to anon, authenticated
  with check (true);

drop policy if exists "anon delete likes" on from_fed_to_chain.likes;
create policy "anon delete likes"
  on from_fed_to_chain.likes for delete to anon, authenticated
  using (true);

drop policy if exists "anon read state" on from_fed_to_chain.user_episode_state;
create policy "anon read state"
  on from_fed_to_chain.user_episode_state for select to anon, authenticated
  using (true);

drop policy if exists "anon write state" on from_fed_to_chain.user_episode_state;
create policy "anon write state"
  on from_fed_to_chain.user_episode_state for all to anon, authenticated
  using (true) with check (true);

grant usage on schema from_fed_to_chain to anon, authenticated, service_role;
grant all on all tables in schema from_fed_to_chain to service_role;
grant select on from_fed_to_chain.episodes to anon, authenticated;
grant select on from_fed_to_chain.episodes_with_stats to anon, authenticated;
grant select, insert, update on from_fed_to_chain.users to anon, authenticated;
grant select, insert, delete on from_fed_to_chain.likes to anon, authenticated;
grant select, insert, update, delete on from_fed_to_chain.user_episode_state to anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table from_fed_to_chain.likes;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';

commit;
