begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Control Center can deploy ahead of the Fly podcast worker. A restart must not
-- stamp the repository's newest visual_version until the actually running fleet
-- has proven it can claim that version. The always-on app refreshes this
-- singleton heartbeat every 30 seconds only while a render Machine is on the
-- same image; retries require a fresh heartbeat and an exact version match.
create table if not exists ops.podcast_pipeline_release_state (
  singleton boolean primary key default true check (singleton),
  visual_version text not null check (nullif(btrim(visual_version), '') is not null),
  heartbeat_at timestamptz not null default now()
);

-- The runtime writes through the narrowly exposed marker RPC and retry guards
-- read as their SECURITY DEFINER owner. No Data API role needs direct table
-- privileges, including service_role.
revoke all on table ops.podcast_pipeline_release_state
  from public, anon, authenticated, service_role;

create or replace function from_fed_to_chain.mark_podcast_pipeline_release(
  p_visual_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(p_visual_version), '') is null then
    raise exception using
      errcode = '22023',
      message = 'Podcast pipeline visual version must not be empty';
  end if;

  insert into ops.podcast_pipeline_release_state as state (
    singleton,
    visual_version,
    heartbeat_at
  )
  values (true, btrim(p_visual_version), now())
  on conflict (singleton) do update
  set visual_version = excluded.visual_version,
      heartbeat_at = excluded.heartbeat_at;
end;
$$;

revoke execute on function from_fed_to_chain.mark_podcast_pipeline_release(text)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.mark_podcast_pipeline_release(text)
  to service_role;

create or replace function ops.assert_podcast_pipeline_visual_release(
  p_visual_version text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deployed_version text;
  v_heartbeat_at timestamptz;
begin
  if nullif(btrim(p_visual_version), '') is null then
    raise exception using
      errcode = '22023',
      message = 'Video restart requires an explicit visual version';
  end if;

  select state.visual_version, state.heartbeat_at
  into v_deployed_version, v_heartbeat_at
  from ops.podcast_pipeline_release_state state
  where state.singleton = true;

  if v_deployed_version is null
    or v_heartbeat_at is null
    or v_heartbeat_at < now() - interval '90 seconds'
  then
    raise exception using
      errcode = '55000',
      message = 'Podcast pipeline release heartbeat is missing or stale; video restart blocked',
      hint = 'Wait for the current from-fed-to-chain-api Fly app and render release to become compatible before retrying.';
  end if;

  if v_deployed_version <> btrim(p_visual_version) then
    raise exception using
      errcode = '55000',
      message = format(
        'Podcast pipeline visual version mismatch: deployed %s, requested %s; video restart blocked',
        v_deployed_version,
        btrim(p_visual_version)
      ),
      hint = 'Wait for the podcast-pipeline Fly deploy that carries the requested visual version on both app and render Machines.';
  end if;
end;
$$;

revoke execute on function ops.assert_podcast_pipeline_visual_release(text)
  from public, anon, authenticated, service_role;

-- Keep every existing restart side effect (including social re-eligibility)
-- behind the old implementation, and add the deployment fence at the public
-- RPC boundary used by Control Center and Telegram recovery.
alter function from_fed_to_chain.retry_episode_video_generation(uuid, text, boolean)
  rename to retry_episode_video_generation_without_release_guard;

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
begin
  perform ops.assert_podcast_pipeline_visual_release(p_visual_version);
  return from_fed_to_chain.retry_episode_video_generation_without_release_guard(
    p_episode_id,
    p_visual_version,
    p_force_replan
  );
end;
$$;

alter function from_fed_to_chain.retry_episode_video_render(uuid, uuid, text)
  rename to retry_episode_video_render_without_release_guard;

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
begin
  perform ops.assert_podcast_pipeline_visual_release(p_visual_version);
  return from_fed_to_chain.retry_episode_video_render_without_release_guard(
    p_episode_id,
    p_episode_localization_id,
    p_visual_version
  );
end;
$$;

revoke execute on function from_fed_to_chain.retry_episode_video_generation_without_release_guard(uuid, text, boolean)
  from public, anon, authenticated, service_role;
revoke execute on function from_fed_to_chain.retry_episode_video_render_without_release_guard(uuid, uuid, text)
  from public, anon, authenticated, service_role;

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
