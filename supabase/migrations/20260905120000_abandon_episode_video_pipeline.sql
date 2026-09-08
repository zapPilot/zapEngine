begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Some episodes can never finish the video pipeline as designed: their missing
-- language lanes were never enqueued, their zh-Hant lane already shipped to
-- social, or their storyboard cannot align against a shorter translation. A
-- restart on those only burns Brave/LLM budget and re-opens a release window
-- that was deliberately closed, so an operator marks them abandoned instead.
--
-- The marker is sticky and deliberately narrow: only the two retry RPCs consult
-- it. Re-posting the source URL (enqueue_episode_video_visual /
-- enqueue_episode_video) stays unguarded because that is an operator asking for
-- the work to be redone from scratch. Re-opening an abandoned episode means
-- clearing both columns.
alter table from_fed_to_chain.episode_video_visuals
  add column if not exists abandoned_at timestamptz,
  add column if not exists abandoned_reason text;

alter table from_fed_to_chain.episode_video_visuals
  drop constraint if exists episode_video_visuals_abandoned_pair_check;
alter table from_fed_to_chain.episode_video_visuals
  add constraint episode_video_visuals_abandoned_pair_check
  check ((abandoned_at is null) = (nullif(btrim(abandoned_reason), '') is null));

create or replace function from_fed_to_chain.assert_episode_video_not_abandoned(
  p_episode_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_abandoned_at timestamptz;
  v_abandoned_reason text;
begin
  select visual.abandoned_at, visual.abandoned_reason
  into v_abandoned_at, v_abandoned_reason
  from from_fed_to_chain.episode_video_visuals visual
  where visual.episode_id = p_episode_id;

  if v_abandoned_at is null then
    return;
  end if;

  raise exception using
    errcode = '22023',
    message = 'Episode video generation was abandoned by an operator; restart blocked',
    hint = v_abandoned_reason;
end;
$$;

revoke execute on function from_fed_to_chain.assert_episode_video_not_abandoned(uuid)
  from public, anon, authenticated, service_role;

-- The abandon check runs before the release fence so an abandoned episode
-- reports why it is closed even while the deployed visual version is stale or
-- the heartbeat is missing.
create or replace function from_fed_to_chain.retry_episode_video_generation(
  p_episode_id uuid,
  p_visual_version text default null,
  p_force_replan boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform from_fed_to_chain.assert_episode_video_not_abandoned(p_episode_id);
  perform ops.assert_podcast_pipeline_visual_release(p_visual_version);
  return from_fed_to_chain.retry_episode_video_generation_without_release_guard(
    p_episode_id,
    p_visual_version,
    p_force_replan
  );
end;
$$;

create or replace function from_fed_to_chain.retry_episode_video_render(
  p_episode_id uuid,
  p_episode_localization_id uuid,
  p_visual_version text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform from_fed_to_chain.assert_episode_video_not_abandoned(p_episode_id);
  perform ops.assert_podcast_pipeline_visual_release(p_visual_version);
  return from_fed_to_chain.retry_episode_video_render_without_release_guard(
    p_episode_id,
    p_episode_localization_id,
    p_visual_version
  );
end;
$$;

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
