begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table from_fed_to_chain.episode_videos
  add column if not exists completion_notified_at timestamptz;

-- Do not replay every historical completion when this ships. Before this
-- migration completion delivery was best-effort and had no durable stamp, so
-- existing completed rows are treated as the legacy baseline. Only completions
-- that happen after this migration (or after a later retry) enter the new
-- durable notification queue.
update from_fed_to_chain.episode_videos video
set completion_notified_at = coalesce(video.completed_at, video.updated_at, now())
where video.status = 'completed'
  and video.completion_notified_at is null;

create index if not exists idx_episode_videos_unnotified_completion
  on from_fed_to_chain.episode_videos (completed_at, episode_localization_id)
  where status = 'completed'
    and telegram_chat_id is not null
    and completion_notified_at is null;

-- A re-render is a new completion lifecycle. Clearing the stamp whenever a row
-- leaves completed (and again when it re-enters) makes retries notify exactly
-- like a newly-created render without teaching every retry RPC about this
-- delivery concern.
create or replace function from_fed_to_chain.reset_episode_video_completion_notification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'completed' or old.status <> 'completed' then
    new.completion_notified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reset_episode_video_completion_notification
  on from_fed_to_chain.episode_videos;
create trigger trg_reset_episode_video_completion_notification
before update of status on from_fed_to_chain.episode_videos
for each row
execute function from_fed_to_chain.reset_episode_video_completion_notification();

-- Read without stamping. The caller sends Telegram first, then acknowledges the
-- exact episode/language only after Telegram returned success. A failed send or
-- process crash therefore leaves the row visible to the next sweep (at-least-once).
create or replace function from_fed_to_chain.reap_completed_episode_video_notifications(
  p_limit integer default 20
)
returns table (
  episode_localization_id uuid,
  telegram_chat_id text,
  episode_id uuid,
  language_code text
)
language sql
security definer
set search_path = ''
as $$
  select
    video.episode_localization_id,
    video.telegram_chat_id,
    localization.episode_id,
    localization.language_code
  from from_fed_to_chain.episode_videos video
  join from_fed_to_chain.episode_localizations localization
    on localization.id = video.episode_localization_id
  where video.status = 'completed'
    and video.telegram_chat_id is not null
    and video.completion_notified_at is null
    and localization.language_code in ('zh-Hant', 'ja', 'en')
  order by video.completed_at nulls last, video.episode_localization_id
  limit greatest(coalesce(p_limit, 20), 1);
$$;

-- sendMessage only has the public episode URL payload, so acknowledge by the
-- same durable identity exposed to the operator: (episode, language).
create or replace function from_fed_to_chain.mark_episode_video_completion_notified(
  p_episode_id uuid,
  p_language_code text
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
    and localization.language_code = p_language_code
    and video.status = 'completed'
    and video.completion_notified_at is null;

  get diagnostics updated_rows = row_count;
  return updated_rows > 0;
end;
$$;

revoke execute on function from_fed_to_chain.reset_episode_video_completion_notification()
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.reset_episode_video_completion_notification()
  to service_role;

revoke execute on function from_fed_to_chain.reap_completed_episode_video_notifications(integer)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.reap_completed_episode_video_notifications(integer)
  to service_role;

revoke execute on function from_fed_to_chain.mark_episode_video_completion_notified(uuid, text)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.mark_episode_video_completion_notified(uuid, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
