begin;

alter table from_fed_to_chain.episode_localizations
  add column if not exists classroom_hls_url text,
  add column if not exists classroom_r2_prefix text;

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

grant select on from_fed_to_chain.episodes_with_stats to anon, authenticated;

notify pgrst, 'reload schema';

commit;
