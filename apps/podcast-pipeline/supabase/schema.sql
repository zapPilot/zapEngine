create extension if not exists pgcrypto;
create schema if not exists from_fed_to_chain;
create schema if not exists from_fed_to_chain_private;

create table if not exists from_fed_to_chain.episodes (
  id uuid primary key default gen_random_uuid(),
  source_url text not null unique,
  source_title text,
  created_at timestamptz not null default now(),
  listened boolean not null default false
);

create index if not exists idx_episodes_created_at
  on from_fed_to_chain.episodes (created_at desc);

create index if not exists idx_episodes_created_at_id
  on from_fed_to_chain.episodes (created_at desc, id desc);

create table if not exists from_fed_to_chain.episode_localizations (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references from_fed_to_chain.episodes(id) on delete cascade,
  language_code text not null default 'zh-Hant'
    check (btrim(language_code) <> ''),
  title text not null,
  hls_url text not null default '',
  classroom_hls_url text,
  raw_text text,
  script text,
  llm_model text,
  llm_thinking_model text,
  llm_provider text,
  tts_language_code text,
  tts_voice_name text,
  r2_prefix text,
  classroom_r2_prefix text,
  status text not null default 'pending'
    check (status in ('pending', 'scraped', 'script_generated', 'audio_generated', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (episode_id, language_code)
);

create index if not exists idx_episode_localizations_language_created
  on from_fed_to_chain.episode_localizations (language_code, created_at desc, episode_id desc);

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

create table if not exists from_fed_to_chain.language_classrooms (
  id uuid primary key default gen_random_uuid(),
  episode_localization_id uuid not null
    references from_fed_to_chain.episode_localizations(id) on delete cascade,
  source_language_code text not null,
  target_language_code text not null,
  one_liner text not null,
  keywords jsonb not null default '[]'::jsonb,
  llm_model text,
  llm_thinking_model text,
  llm_provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint language_classrooms_language_codes_not_empty
    check (btrim(source_language_code) <> '' and btrim(target_language_code) <> ''),
  constraint language_classrooms_keywords_is_array
    check (jsonb_typeof(keywords) = 'array'),
  constraint language_classrooms_localization_target_language_key
    unique (episode_localization_id, target_language_code)
);

create index if not exists idx_language_classrooms_localization
  on from_fed_to_chain.language_classrooms (episode_localization_id);

create or replace function from_fed_to_chain_private.upsert_podcast_user(
  p_email text,
  p_device_id text
)
returns table (
  id uuid,
  display_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := nullif(lower(btrim(p_email)), '');
  normalized_device_id_text text := nullif(btrim(p_device_id), '');
  normalized_device_id uuid;
  listener_name constant text := 'From Fed to Chain listener';
begin
  if (normalized_email is null) = (normalized_device_id_text is null) then
    raise exception 'Provide exactly one of p_email or p_device_id'
      using errcode = '22023';
  end if;

  if normalized_device_id_text is not null then
    if normalized_device_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'p_device_id must be UUID text'
        using errcode = '22023';
    end if;

    normalized_device_id := normalized_device_id_text::uuid;

    return query
    insert into from_fed_to_chain.users (device_id, display_name)
    values (normalized_device_id::text, listener_name)
    on conflict (device_id) do update
      set display_name = excluded.display_name
    returning users.id, users.display_name;

    return;
  end if;

  return query
  insert into from_fed_to_chain.users (email, display_name)
  values (normalized_email, listener_name)
  on conflict (email) do update
    set display_name = excluded.display_name
  returning users.id, users.display_name;
end;
$$;

create or replace function from_fed_to_chain.sign_in_podcast_user(
  p_email text default null,
  p_device_id text default null
)
returns table (
  id uuid,
  display_name text
)
language sql
security definer
set search_path = ''
as $$
  select user_row.id, user_row.display_name
  from from_fed_to_chain_private.upsert_podcast_user(p_email, p_device_id) as user_row;
$$;

alter table from_fed_to_chain.episodes enable row level security;
alter table from_fed_to_chain.episode_localizations enable row level security;
alter table from_fed_to_chain.users enable row level security;
alter table from_fed_to_chain.likes enable row level security;
alter table from_fed_to_chain.user_episode_state enable row level security;
alter table from_fed_to_chain.language_classrooms enable row level security;

drop view if exists from_fed_to_chain.episodes_with_stats;
create view from_fed_to_chain.episodes_with_stats
with (security_invoker = true) as
select e.id,
       e.id as episode_id,
       el.id as localization_id,
       el.title,
       el.language_code,
       el.hls_url,
       el.classroom_hls_url,
       el.script,
       el.llm_model,
       el.llm_thinking_model,
       el.llm_provider,
       el.status,
       e.created_at,
       e.listened,
       coalesce(l.like_count, 0)::int as like_count,
        el.language_classrooms_jsonb as language_classrooms
from from_fed_to_chain.episodes e
join from_fed_to_chain.episode_localizations el on el.episode_id = e.id
left join (
  select episode_id, count(*) as like_count
  from from_fed_to_chain.likes
  group by episode_id
) l on l.episode_id = e.id
where el.status = 'completed'
  and el.hls_url <> '';

drop policy if exists "Service role can manage episodes"
  on from_fed_to_chain.episodes;
create policy "Service role can manage episodes"
  on from_fed_to_chain.episodes for all to service_role
  using (true) with check (true);

drop policy if exists "anon read completed podcast episodes"
  on from_fed_to_chain.episodes;
create policy "anon read completed podcast episodes"
  on from_fed_to_chain.episodes for select to anon, authenticated
  using (
    exists (
      select 1
      from from_fed_to_chain.episode_localizations el
      where el.episode_id = episodes.id
        and el.status = 'completed'
        and el.hls_url <> ''
    )
  );

drop policy if exists "Service role can manage episode localizations"
  on from_fed_to_chain.episode_localizations;
create policy "Service role can manage episode localizations"
  on from_fed_to_chain.episode_localizations for all to service_role
  using (true) with check (true);

drop policy if exists "anon read completed episode localizations"
  on from_fed_to_chain.episode_localizations;
create policy "anon read completed episode localizations"
  on from_fed_to_chain.episode_localizations for select to anon, authenticated
  using (status = 'completed' and hls_url <> '');

drop policy if exists "anon read podcast users"
  on from_fed_to_chain.users;
create policy "anon read podcast users"
  on from_fed_to_chain.users for select to anon, authenticated
  using (device_id is not null or display_name = 'From Fed to Chain listener');

drop policy if exists "anon insert podcast users"
  on from_fed_to_chain.users;
create policy "anon insert podcast users"
  on from_fed_to_chain.users for insert to anon, authenticated
  with check (device_id is not null or display_name = 'From Fed to Chain listener');

drop policy if exists "anon update podcast users"
  on from_fed_to_chain.users;
create policy "anon update podcast users"
  on from_fed_to_chain.users for update to anon, authenticated
  using (device_id is not null or display_name = 'From Fed to Chain listener')
  with check (device_id is not null or display_name = 'From Fed to Chain listener');

drop policy if exists "anon read likes"
  on from_fed_to_chain.likes;
create policy "anon read likes"
  on from_fed_to_chain.likes for select to anon, authenticated
  using (true);

drop policy if exists "anon insert likes"
  on from_fed_to_chain.likes;
create policy "anon insert likes"
  on from_fed_to_chain.likes for insert to anon, authenticated
  with check (true);

drop policy if exists "anon delete likes"
  on from_fed_to_chain.likes;
create policy "anon delete likes"
  on from_fed_to_chain.likes for delete to anon, authenticated
  using (true);

drop policy if exists "anon update likes"
  on from_fed_to_chain.likes;
create policy "anon update likes"
  on from_fed_to_chain.likes for update to anon, authenticated
  using (true) with check (true);

drop policy if exists "anon read state"
  on from_fed_to_chain.user_episode_state;
create policy "anon read state"
  on from_fed_to_chain.user_episode_state for select to anon, authenticated
  using (true);

drop policy if exists "anon write state"
  on from_fed_to_chain.user_episode_state;
create policy "anon write state"
  on from_fed_to_chain.user_episode_state for all to anon, authenticated
  using (true) with check (true);

drop policy if exists "Service role can manage language classrooms"
  on from_fed_to_chain.language_classrooms;
create policy "Service role can manage language classrooms"
  on from_fed_to_chain.language_classrooms for all to service_role
  using (true) with check (true);

drop policy if exists "anon read completed language classrooms"
  on from_fed_to_chain.language_classrooms;
create policy "anon read completed language classrooms"
  on from_fed_to_chain.language_classrooms for select to anon, authenticated
  using (
    exists (
      select 1
      from from_fed_to_chain.episode_localizations el
      where el.id = language_classrooms.episode_localization_id
        and el.status = 'completed'
        and el.hls_url <> ''
    )
  );

revoke all on schema from_fed_to_chain_private from public;
revoke all on schema from_fed_to_chain_private from anon, authenticated;
grant usage on schema from_fed_to_chain to anon, authenticated, service_role;

grant all on from_fed_to_chain.episodes to service_role;
grant all on from_fed_to_chain.episode_localizations to service_role;
grant all on from_fed_to_chain.users to service_role;
grant all on from_fed_to_chain.likes to service_role;
grant all on from_fed_to_chain.user_episode_state to service_role;
grant all on from_fed_to_chain.language_classrooms to service_role;

revoke select on from_fed_to_chain.episodes from anon, authenticated;
grant select (id, source_url, source_title, created_at, listened)
  on from_fed_to_chain.episodes to anon, authenticated;
grant select (
  id,
  episode_id,
  language_code,
  title,
  hls_url,
  classroom_hls_url,
  script,
  llm_model,
  llm_thinking_model,
  llm_provider,
  status,
  created_at
) on from_fed_to_chain.episode_localizations to anon, authenticated;
grant select (
  episode_localization_id,
  source_language_code,
  target_language_code,
  one_liner,
  keywords,
  created_at,
  updated_at
) on from_fed_to_chain.language_classrooms to anon, authenticated;
grant select on from_fed_to_chain.episodes_with_stats to anon, authenticated;

revoke select, insert, update, delete on from_fed_to_chain.users
  from anon, authenticated;

revoke select, insert, update, delete on from_fed_to_chain.likes
  from anon, authenticated;
grant select (user_id, episode_id)
  on from_fed_to_chain.likes to anon, authenticated;
grant insert (user_id, episode_id)
  on from_fed_to_chain.likes to anon, authenticated;
grant update (user_id, episode_id)
  on from_fed_to_chain.likes to anon, authenticated;
grant delete on from_fed_to_chain.likes to anon, authenticated;
grant select, insert, update, delete
  on from_fed_to_chain.likes to anon, authenticated;

revoke select, insert, update, delete
  on from_fed_to_chain.user_episode_state from anon, authenticated;
grant select (user_id, episode_id, listened, last_position_seconds)
  on from_fed_to_chain.user_episode_state to anon, authenticated;
grant insert (user_id, episode_id, listened, last_position_seconds, updated_at)
  on from_fed_to_chain.user_episode_state to anon, authenticated;
grant update (user_id, episode_id, listened, last_position_seconds, updated_at)
  on from_fed_to_chain.user_episode_state to anon, authenticated;
grant select, insert, update
  on from_fed_to_chain.user_episode_state to anon, authenticated;

revoke execute on function from_fed_to_chain_private.upsert_podcast_user(text, text)
  from public, anon, authenticated;

revoke execute on function from_fed_to_chain.sign_in_podcast_user(text, text)
  from public;
grant execute on function from_fed_to_chain.sign_in_podcast_user(text, text)
  to anon, authenticated;
