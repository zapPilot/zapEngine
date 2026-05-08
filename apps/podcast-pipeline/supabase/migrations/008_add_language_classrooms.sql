begin;

alter table from_fed_to_chain.episodes
  add column if not exists language_code text;

update from_fed_to_chain.episodes
set language_code = 'zh-TW'
where language_code is null or btrim(language_code) = '';

alter table from_fed_to_chain.episodes
  alter column language_code set default 'zh-TW',
  alter column language_code set not null;

alter table from_fed_to_chain.episodes
  drop constraint if exists episodes_language_code_not_empty;

alter table from_fed_to_chain.episodes
  add constraint episodes_language_code_not_empty
  check (btrim(language_code) <> '');

alter table from_fed_to_chain.episodes
  drop constraint if exists episodes_source_url_key;

drop index if exists from_fed_to_chain.episodes_source_url_key;

create unique index if not exists episodes_source_url_language_code_key
  on from_fed_to_chain.episodes (source_url, language_code);

create index if not exists idx_episodes_language_created_at_id
  on from_fed_to_chain.episodes (language_code, created_at desc, id desc);

create table if not exists from_fed_to_chain.language_classrooms (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references from_fed_to_chain.episodes(id) on delete cascade,
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
  constraint language_classrooms_episode_target_language_key
    unique (episode_id, target_language_code)
);

create index if not exists idx_language_classrooms_episode
  on from_fed_to_chain.language_classrooms (episode_id);

create index if not exists idx_language_classrooms_target_language
  on from_fed_to_chain.language_classrooms (target_language_code);

drop view if exists from_fed_to_chain.episodes_with_stats;

create view from_fed_to_chain.episodes_with_stats
with (security_invoker = true) as
select e.id,
       e.title,
       e.language_code,
       e.hls_url,
       e.script,
       e.status,
       e.created_at,
       e.listened,
       coalesce(l.like_count, 0)::int as like_count,
       coalesce(lc.language_classrooms, '[]'::jsonb) as language_classrooms
from from_fed_to_chain.episodes e
left join (
  select episode_id, count(*) as like_count
  from from_fed_to_chain.likes
  group by episode_id
) l on l.episode_id = e.id
left join (
  select episode_id,
         jsonb_agg(
           jsonb_build_object(
             'sourceLanguageCode', source_language_code,
             'targetLanguageCode', target_language_code,
             'oneLiner', one_liner,
             'keywords', keywords
           )
           order by target_language_code
         ) as language_classrooms
  from from_fed_to_chain.language_classrooms
  group by episode_id
) lc on lc.episode_id = e.id
where e.status = 'completed'
  and e.hls_url <> '';

alter table from_fed_to_chain.language_classrooms enable row level security;

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
      from from_fed_to_chain.episodes e
      where e.id = language_classrooms.episode_id
        and e.status = 'completed'
        and e.hls_url <> ''
    )
  );

grant all on from_fed_to_chain.language_classrooms to service_role;
grant select (
  episode_id,
  source_language_code,
  target_language_code,
  one_liner,
  keywords,
  created_at,
  updated_at
) on from_fed_to_chain.language_classrooms to anon, authenticated;

revoke select on from_fed_to_chain.episodes from anon, authenticated;
grant select (id, title, language_code, hls_url, script, status, created_at, listened)
  on from_fed_to_chain.episodes to anon, authenticated;
grant select on from_fed_to_chain.episodes_with_stats to anon, authenticated;

notify pgrst, 'reload schema';

commit;
