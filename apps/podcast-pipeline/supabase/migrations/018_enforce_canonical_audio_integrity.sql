begin;

alter table from_fed_to_chain.episode_localizations
  drop constraint if exists episode_localizations_canonical_completed_audio_check;

update from_fed_to_chain.episode_localizations
set status = case
      when nullif(btrim(hls_url), '') is null then 'script_generated'
      else 'audio_generated'
    end,
    updated_at = now()
where language_code = 'zh-Hant'
  and status = 'completed'
  and (
    nullif(btrim(hls_url), '') is null
    or nullif(btrim(classroom_hls_url), '') is null
  );

alter table from_fed_to_chain.episode_localizations
  add constraint episode_localizations_canonical_completed_audio_check
  check (
    language_code <> 'zh-Hant'
    or status <> 'completed'
    or (
      nullif(btrim(hls_url), '') is not null
      and nullif(btrim(classroom_hls_url), '') is not null
    )
  );

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
  and nullif(btrim(el.hls_url), '') is not null
  and (
    el.language_code <> 'zh-Hant'
    or nullif(btrim(el.classroom_hls_url), '') is not null
  );

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
        and nullif(btrim(el.hls_url), '') is not null
        and (
          el.language_code <> 'zh-Hant'
          or nullif(btrim(el.classroom_hls_url), '') is not null
        )
    )
  );

drop policy if exists "anon read completed episode localizations"
  on from_fed_to_chain.episode_localizations;
create policy "anon read completed episode localizations"
  on from_fed_to_chain.episode_localizations for select to anon, authenticated
  using (
    status = 'completed'
    and nullif(btrim(hls_url), '') is not null
    and (
      language_code <> 'zh-Hant'
      or nullif(btrim(classroom_hls_url), '') is not null
    )
  );

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
        and nullif(btrim(el.hls_url), '') is not null
        and (
          el.language_code <> 'zh-Hant'
          or nullif(btrim(el.classroom_hls_url), '') is not null
        )
    )
  );

create or replace function from_fed_to_chain.enqueue_episode_video(
  p_episode_localization_id uuid,
  p_telegram_chat_id text default null
)
returns setof from_fed_to_chain.episode_videos
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
begin
  if not exists (
    select 1
    from from_fed_to_chain.episode_localizations localization
    where localization.id = p_episode_localization_id
      and localization.language_code = 'zh-Hant'
      and localization.status = 'completed'
      and nullif(btrim(localization.hls_url), '') is not null
      and nullif(btrim(localization.classroom_hls_url), '') is not null
  ) then
    raise exception 'Episode video jobs require completed zh-Hant main and classroom audio'
      using errcode = '22023';
  end if;

  insert into from_fed_to_chain.episode_videos (
    episode_localization_id,
    telegram_chat_id
  )
  values (
    p_episode_localization_id,
    nullif(btrim(p_telegram_chat_id), '')
  )
  on conflict (episode_localization_id) do nothing;

  select video.status
  into current_status
  from from_fed_to_chain.episode_videos video
  where video.episode_localization_id = p_episode_localization_id
  for update;

  if current_status = 'failed' then
    update from_fed_to_chain.episode_videos video
    set status = 'queued',
        telegram_chat_id = coalesce(
          nullif(btrim(p_telegram_chat_id), ''),
          video.telegram_chat_id
        ),
        attempt_count = 0,
        next_attempt_at = now(),
        lease_owner = null,
        lease_expires_at = null,
        last_error = null,
        failure_notified_at = null,
        started_at = null,
        completed_at = null,
        updated_at = now()
    where video.episode_localization_id = p_episode_localization_id;
  elsif current_status in ('queued', 'processing')
        and nullif(btrim(p_telegram_chat_id), '') is not null then
    update from_fed_to_chain.episode_videos video
    set telegram_chat_id = nullif(btrim(p_telegram_chat_id), ''),
        updated_at = now()
    where video.episode_localization_id = p_episode_localization_id;
  end if;

  return query
  select video.*
  from from_fed_to_chain.episode_videos video
  where video.episode_localization_id = p_episode_localization_id;
end;
$$;

grant select on from_fed_to_chain.episodes_with_stats to anon, authenticated;
grant select on from_fed_to_chain.episodes_with_stats to service_role;

revoke execute on function from_fed_to_chain.enqueue_episode_video(uuid, text)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.enqueue_episode_video(uuid, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
