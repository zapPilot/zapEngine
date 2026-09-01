begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- A v2 cohort is identified by any persisted rotating-platform experiment key.
-- New code writes a rotating lane before Rednote, so even an interrupted v2
-- enqueue leaves an unambiguous generation marker. If an episode already has
-- durable rows but none of those markers, it belongs to the legacy generation;
-- silently skip a v2 insert rather than reshaping that durable cohort.
create or replace function from_fed_to_chain_private.guard_social_language_v2_generation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.experiment_key = any (
    array['x-language-v2', 'threads-language-v1', 'youtube-language-v1']::text[]
  )
  and exists (
    select 1
    from from_fed_to_chain.social_publish_jobs existing
    where existing.episode_id = new.episode_id
  )
  and not exists (
    select 1
    from from_fed_to_chain.social_publish_jobs existing
    where existing.episode_id = new.episode_id
      and existing.experiment_key = any (
        array['x-language-v2', 'threads-language-v1', 'youtube-language-v1']::text[]
      )
  ) then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists social_publish_jobs_language_v2_generation_guard
  on from_fed_to_chain.social_publish_jobs;

create trigger social_publish_jobs_language_v2_generation_guard
before insert on from_fed_to_chain.social_publish_jobs
for each row
execute function from_fed_to_chain_private.guard_social_language_v2_generation();

-- `social_waiting_media` is now a pre-scheduling episode-language readiness
-- signal. The final platform-language mapping does not exist until an article
-- slot is chosen, so the view must not pretend to know that future lane shape.
-- Keep the historical column layout for PostgREST compatibility; platform and
-- experiment columns are intentionally NULL because they are no longer part of
-- this view's meaning.
create or replace view from_fed_to_chain.social_waiting_media as
with required_language(language_code) as (
  values
    ('zh-Hant'::text),
    ('ja'::text),
    ('en'::text)
)
select
  localization.episode_id,
  null::text as platform,
  required_language.language_code,
  localization.title,
  null::text as experiment_key,
  null::text as experiment_variant
from from_fed_to_chain.episodes episode
cross join required_language
join from_fed_to_chain.episode_localizations localization
  on localization.episode_id = episode.id
  and localization.language_code = required_language.language_code
  and localization.status = 'completed'
left join from_fed_to_chain.episode_videos video
  on video.episode_localization_id = localization.id
where episode.created_at >= '2026-08-24T00:00:00.000Z'::timestamptz
  and (
    video.episode_localization_id is null
    or video.status <> 'completed'
    or nullif(btrim(video.mp4_url), '') is null
    or nullif(btrim(video.thumbnail_url), '') is null
    or coalesce(video.duration_seconds, 0) <= 0
  )
  and not exists (
    select 1
    from from_fed_to_chain.social_publish_jobs job
    where job.episode_id = episode.id
  )
  and not exists (
    select 1
    from from_fed_to_chain.social_posts post
    where post.episode_id = episode.id
  );

grant select on from_fed_to_chain.social_waiting_media to service_role;

notify pgrst, 'reload schema';

commit;
