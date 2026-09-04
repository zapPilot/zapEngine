begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- The social rollout intentionally ignores episodes created before 2026-08-24.
-- A manual pipeline recovery is the one explicit operator signal that an old,
-- never-published episode should re-enter that rollout. Keep the existing
-- recovery RPCs intact behind base names, then wrap them so the restart and
-- eligibility bump succeed or roll back together.
--
-- Published/durable social cohorts are never reopened here: any existing
-- social_publish_jobs or social_posts row keeps the original episode timestamp.

alter function from_fed_to_chain.restart_podcast_ingest(uuid, text)
  rename to restart_podcast_ingest_without_social_reeligibility;

create function from_fed_to_chain.restart_podcast_ingest(
  p_episode_id uuid,
  p_language_code text default 'zh-Hant'
)
returns from_fed_to_chain.podcast_ingest_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job from_fed_to_chain.podcast_ingest_jobs;
begin
  select *
  into v_job
  from from_fed_to_chain.restart_podcast_ingest_without_social_reeligibility(
    p_episode_id,
    p_language_code
  );

  update from_fed_to_chain.episodes episode
  set created_at = now()
  where episode.id = p_episode_id
    and episode.created_at < '2026-08-24T00:00:00.000Z'::timestamptz
    and not exists (
      select 1
      from from_fed_to_chain.social_publish_jobs job
      where job.episode_id = p_episode_id
    )
    and not exists (
      select 1
      from from_fed_to_chain.social_posts post
      where post.episode_id = p_episode_id
    );

  return v_job;
end;
$$;

alter function from_fed_to_chain.retry_episode_video_generation(uuid, text, boolean)
  rename to retry_episode_video_generation_without_social_reeligibility;

create function from_fed_to_chain.retry_episode_video_generation(
  p_episode_id uuid,
  p_visual_version text default null,
  p_force_replan boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restarted boolean;
begin
  v_restarted := from_fed_to_chain.retry_episode_video_generation_without_social_reeligibility(
    p_episode_id,
    p_visual_version,
    p_force_replan
  );

  if v_restarted then
    update from_fed_to_chain.episodes episode
    set created_at = now()
    where episode.id = p_episode_id
      and episode.created_at < '2026-08-24T00:00:00.000Z'::timestamptz
      and not exists (
        select 1
        from from_fed_to_chain.social_publish_jobs job
        where job.episode_id = p_episode_id
      )
      and not exists (
        select 1
        from from_fed_to_chain.social_posts post
        where post.episode_id = p_episode_id
      );
  end if;

  return v_restarted;
end;
$$;

alter function from_fed_to_chain.retry_episode_video_render(uuid, uuid, text)
  rename to retry_episode_video_render_without_social_reeligibility;

create function from_fed_to_chain.retry_episode_video_render(
  p_episode_id uuid,
  p_episode_localization_id uuid,
  p_visual_version text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restarted boolean;
begin
  v_restarted := from_fed_to_chain.retry_episode_video_render_without_social_reeligibility(
    p_episode_id,
    p_episode_localization_id,
    p_visual_version
  );

  if v_restarted then
    update from_fed_to_chain.episodes episode
    set created_at = now()
    where episode.id = p_episode_id
      and episode.created_at < '2026-08-24T00:00:00.000Z'::timestamptz
      and not exists (
        select 1
        from from_fed_to_chain.social_publish_jobs job
        where job.episode_id = p_episode_id
      )
      and not exists (
        select 1
        from from_fed_to_chain.social_posts post
        where post.episode_id = p_episode_id
      );
  end if;

  return v_restarted;
end;
$$;

revoke execute on function from_fed_to_chain.restart_podcast_ingest(uuid, text)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.restart_podcast_ingest(uuid, text)
  to service_role;

revoke execute on function from_fed_to_chain.retry_episode_video_generation(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.retry_episode_video_generation(uuid, text, boolean)
  to service_role;

revoke execute on function from_fed_to_chain.retry_episode_video_render(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.retry_episode_video_render(uuid, uuid, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
