begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Completion notifications used to be delivered once per language. Keep the
-- per-language durable stamps, but only reap an episode after all three video
-- lanes have completed. A single Telegram send then acknowledges every
-- completed language row for that episode.
create or replace function from_fed_to_chain.reap_completed_episode_video_notification_groups(
  p_limit integer default 20
)
returns table (
  telegram_chat_id text,
  episode_id uuid
)
language sql
security definer
set search_path = ''
as $$
  select
    max(video.telegram_chat_id) filter (where video.telegram_chat_id is not null)
      as telegram_chat_id,
    localization.episode_id
  from from_fed_to_chain.episode_localizations localization
  join from_fed_to_chain.episode_videos video
    on video.episode_localization_id = localization.id
  where localization.language_code in ('zh-Hant', 'ja', 'en')
  group by localization.episode_id
  having count(distinct localization.language_code) = 3
    and bool_and(video.status = 'completed')
    and bool_or(video.telegram_chat_id is not null)
    and bool_or(video.completion_notified_at is null)
    and max(video.completed_at) <= now() - interval '1 minute'
  order by max(video.completed_at) nulls last, localization.episode_id
  limit greatest(coalesce(p_limit, 20), 1);
$$;

create or replace function from_fed_to_chain.mark_episode_video_completion_group_notified(
  p_episode_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_rows integer;
begin
  update from_fed_to_chain.episode_videos video
  set completion_notified_at = now(),
      updated_at = now()
  from from_fed_to_chain.episode_localizations localization
  where localization.id = video.episode_localization_id
    and localization.episode_id = p_episode_id
    and localization.language_code in ('zh-Hant', 'ja', 'en')
    and video.status = 'completed'
    and video.completion_notified_at is null;

  get diagnostics updated_rows = row_count;
  return updated_rows > 0;
end;
$$;

revoke execute on function from_fed_to_chain.reap_completed_episode_video_notification_groups(integer)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.reap_completed_episode_video_notification_groups(integer)
  to service_role;

revoke execute on function from_fed_to_chain.mark_episode_video_completion_group_notified(uuid)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.mark_episode_video_completion_group_notified(uuid)
  to service_role;

notify pgrst, 'reload schema';

commit;
