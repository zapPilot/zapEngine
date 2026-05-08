begin;

alter table from_fed_to_chain.episodes
  add column if not exists source_title text;

update from_fed_to_chain.episodes
set source_title = title
where source_title is null;

create table if not exists from_fed_to_chain.episode_localizations (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references from_fed_to_chain.episodes(id) on delete cascade,
  language_code text not null default 'zh-Hant',
  title text not null,
  hls_url text not null default '',
  raw_text text,
  script text,
  llm_model text,
  llm_thinking_model text,
  llm_provider text,
  tts_language_code text,
  tts_voice_name text,
  r2_prefix text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint episode_localizations_language_code_not_empty
    check (btrim(language_code) <> ''),
  constraint episode_localizations_status_check
    check (status in ('pending', 'scraped', 'script_generated', 'audio_generated', 'completed')),
  constraint episode_localizations_episode_language_key
    unique (episode_id, language_code)
);

insert into from_fed_to_chain.episode_localizations (
  episode_id,
  language_code,
  title,
  hls_url,
  raw_text,
  script,
  llm_model,
  llm_thinking_model,
  llm_provider,
  status,
  created_at,
  updated_at
)
select e.id,
       case
         when e.language_code = 'zh-TW' then 'zh-Hant'
         when e.language_code is null or btrim(e.language_code) = '' then 'zh-Hant'
         else e.language_code
       end,
       e.title,
       coalesce(e.hls_url, ''),
       e.raw_text,
       e.script,
       e.llm_model,
       e.llm_thinking_model,
       e.llm_provider,
       coalesce(e.status, 'pending'),
       e.created_at,
       now()
from from_fed_to_chain.episodes e
on conflict (episode_id, language_code) do update
set title = excluded.title,
    hls_url = excluded.hls_url,
    raw_text = excluded.raw_text,
    script = excluded.script,
    llm_model = excluded.llm_model,
    llm_thinking_model = excluded.llm_thinking_model,
    llm_provider = excluded.llm_provider,
    status = excluded.status,
    updated_at = now();

alter table from_fed_to_chain.episodes
  drop constraint if exists episodes_source_url_language_code_key,
  drop constraint if exists episodes_language_code_not_empty,
  drop constraint if exists episodes_status_check;

drop index if exists from_fed_to_chain.episodes_source_url_language_code_key;
drop index if exists from_fed_to_chain.idx_episodes_language_created_at_id;

drop view if exists from_fed_to_chain.episodes_with_stats;
drop policy if exists "anon read completed podcast episodes" on from_fed_to_chain.episodes;
drop policy if exists "anon read completed language classrooms"
  on from_fed_to_chain.language_classrooms;

alter table from_fed_to_chain.episodes
  drop column if exists language_code,
  drop column if exists hls_url,
  drop column if exists raw_text,
  drop column if exists script,
  drop column if exists llm_model,
  drop column if exists llm_thinking_model,
  drop column if exists llm_provider,
  drop column if exists status,
  drop column if exists title;

create unique index if not exists episodes_source_url_key
  on from_fed_to_chain.episodes (source_url);

create index if not exists idx_episode_localizations_language_created
  on from_fed_to_chain.episode_localizations (language_code, created_at desc, episode_id desc);

alter table from_fed_to_chain.language_classrooms
  add column if not exists episode_localization_id uuid
    references from_fed_to_chain.episode_localizations(id) on delete cascade;

update from_fed_to_chain.language_classrooms lc
set source_language_code = 'zh-Hant'
where lc.source_language_code = 'zh-TW';

update from_fed_to_chain.language_classrooms lc
set episode_localization_id = el.id
from from_fed_to_chain.episode_localizations el
where lc.episode_localization_id is null
  and lc.episode_id = el.episode_id
  and lc.source_language_code = el.language_code;

delete from from_fed_to_chain.language_classrooms
where episode_localization_id is null;

alter table from_fed_to_chain.language_classrooms
  alter column episode_localization_id set not null,
  drop constraint if exists language_classrooms_episode_target_language_key,
  drop constraint if exists language_classrooms_localization_target_language_key,
  add constraint language_classrooms_localization_target_language_key
    unique (episode_localization_id, target_language_code);

alter table from_fed_to_chain.language_classrooms
  drop column if exists episode_id;

create index if not exists idx_language_classrooms_localization
  on from_fed_to_chain.language_classrooms (episode_localization_id);

drop index if exists from_fed_to_chain.idx_language_classrooms_episode;
drop index if exists from_fed_to_chain.idx_language_classrooms_target_language;

create view from_fed_to_chain.episodes_with_stats
with (security_invoker = true) as
select e.id,
       e.id as episode_id,
       el.id as localization_id,
       el.title,
       el.language_code,
       el.hls_url,
       el.script,
       el.llm_model,
       el.llm_thinking_model,
       el.llm_provider,
       el.status,
       e.created_at,
       e.listened,
       coalesce(l.like_count, 0)::int as like_count,
       coalesce(lc.language_classrooms, '[]'::jsonb) as language_classrooms
from from_fed_to_chain.episodes e
join from_fed_to_chain.episode_localizations el on el.episode_id = e.id
left join (
  select episode_id, count(*) as like_count
  from from_fed_to_chain.likes
  group by episode_id
) l on l.episode_id = e.id
left join (
  select episode_localization_id,
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
  group by episode_localization_id
) lc on lc.episode_localization_id = el.id
where el.status = 'completed'
  and el.hls_url <> '';

alter table from_fed_to_chain.episodes enable row level security;
alter table from_fed_to_chain.episode_localizations enable row level security;
alter table from_fed_to_chain.language_classrooms enable row level security;

drop policy if exists "Service role can manage episode localizations"
  on from_fed_to_chain.episode_localizations;
create policy "Service role can manage episode localizations"
  on from_fed_to_chain.episode_localizations for all to service_role
  using (true) with check (true);

drop policy if exists "Service role can manage language classrooms"
  on from_fed_to_chain.language_classrooms;
create policy "Service role can manage language classrooms"
  on from_fed_to_chain.language_classrooms for all to service_role
  using (true) with check (true);

drop policy if exists "anon read completed podcast episodes" on from_fed_to_chain.episodes;
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

drop policy if exists "anon read completed episode localizations"
  on from_fed_to_chain.episode_localizations;
create policy "anon read completed episode localizations"
  on from_fed_to_chain.episode_localizations for select to anon, authenticated
  using (status = 'completed' and hls_url <> '');

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

grant all on from_fed_to_chain.episode_localizations to service_role;
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

notify pgrst, 'reload schema';

commit;
