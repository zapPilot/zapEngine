begin;

alter table from_fed_to_chain.episode_video_visuals
  add column if not exists failure_notified_at timestamptz;

-- Every retry path, including the older enqueue RPC, must make a future
-- terminal failure notify again. Centralize that invariant on the state
-- transition instead of requiring every caller to remember the new column.
create or replace function from_fed_to_chain.reset_episode_video_visual_failure_notification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'failed' and new.status <> 'failed' then
    new.failure_notified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reset_episode_video_visual_failure_notification
  on from_fed_to_chain.episode_video_visuals;
create trigger trg_reset_episode_video_visual_failure_notification
before update of status on from_fed_to_chain.episode_video_visuals
for each row
execute function from_fed_to_chain.reset_episode_video_visual_failure_notification();

-- Visual planning is a prerequisite for every language render. A terminal
-- visual failure therefore blocks the whole episode even though the downstream
-- episode_videos rows remain queued. Give it the same durable, at-least-once
-- Telegram notification contract as localized render failures.
create or replace function from_fed_to_chain.reap_failed_episode_video_visual_notifications(
  p_limit integer default 20
)
returns table (
  episode_id uuid,
  telegram_chat_id text,
  last_error text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select
    visual.episode_id,
    visual.telegram_chat_id,
    visual.last_error
  from from_fed_to_chain.episode_video_visuals visual
  where visual.status = 'failed'
    and visual.telegram_chat_id is not null
    and visual.failure_notified_at is null
  order by visual.updated_at
  limit greatest(coalesce(p_limit, 20), 1);
end;
$$;

create or replace function from_fed_to_chain.mark_episode_video_visual_failure_notified(
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
  update from_fed_to_chain.episode_video_visuals visual
  set failure_notified_at = now(),
      updated_at = now()
  where visual.episode_id = p_episode_id
    and visual.status = 'failed'
    and visual.failure_notified_at is null;

  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end;
$$;

-- Narrow operator remediation for Control Center. This deliberately restarts
-- only the unfinished video checkpoints: translation, scripts, narration and
-- classroom audio are prerequisites and are never rewritten here.
--
-- `p_visual_version` is the caller's currently deployed visual version. Both
-- claim RPCs fence on `visual_version`, so requeueing work under a checkpoint
-- version the running workers no longer pass writes it into a state nothing can
-- ever claim -- and, because leaving 'failed' also re-arms the notification, it
-- would stop alerting too. Supplying it lets a stale checkpoint be repaired the
-- same way `enqueue_episode_video_visual` repairs one. It defaults to null so
-- the signature stays callable during the rollout window; a null caller keeps
-- the row's existing version.
create or replace function from_fed_to_chain.retry_episode_video_generation(
  p_episode_id uuid,
  p_visual_version text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  visual_record record;
  ready_languages integer;
  target_visual_version text;
begin
  target_visual_version := nullif(btrim(coalesce(p_visual_version, '')), '');

  select
    visual.status,
    visual.visual_hash,
    visual.visual_version,
    visual.source_hash,
    visual.lease_expires_at
  into visual_record
  from from_fed_to_chain.episode_video_visuals visual
  where visual.episode_id = p_episode_id
  for update;

  if not found then
    raise exception 'Episode has no video visual job'
      using errcode = '22023';
  end if;

  if visual_record.status = 'processing'
      and visual_record.lease_expires_at > now() then
    raise exception 'Episode video generation is currently processing'
      using errcode = '55000';
  end if;

  -- Locking the visual row alone is not enough: `claim_episode_video_v2` locks
  -- only `episode_videos`, so without this a worker can claim -- and then fail
  -- -- a render between the lease preflight below and the resets further down,
  -- leaving that language terminal while this function still returns success.
  --
  -- `nowait`, not a plain wait, because that same claim RPC opens with a
  -- table-wide expired-lease reap UPDATE which does wait and which the planner
  -- drives through the lease index, taking rows in `lease_expires_at` order --
  -- unrelated to the key order used here. Two stuck renders of one episode
  -- whose lease order inverts their key order is exactly the state that makes
  -- an operator click Retry, and a waiting lock there forms a real cycle whose
  -- victim is the worker's claim rather than this call. Never waiting on a
  -- render row while holding one makes the cycle impossible, and the visual row
  -- is always taken first and never while holding a render row, so it cannot
  -- close one either. The cost is an honest conflict when a millisecond-scale
  -- worker RPC happens to hold a row.
  begin
    perform 1
    from from_fed_to_chain.episode_videos video
    where video.episode_id = p_episode_id
    order by video.episode_localization_id
    for update nowait;
  exception
    when lock_not_available then
      raise exception 'Episode video generation is currently processing'
        using errcode = '55000';
  end;

  -- The UI applies the same guard for operator feedback, but correctness lives
  -- here: a service-role caller must not be able to clear a live ffmpeg/render
  -- lease underneath the worker.
  if exists (
    select 1
    from from_fed_to_chain.episode_videos video
    where video.episode_id = p_episode_id
      and video.status = 'processing'
      and video.lease_expires_at > now()
  ) then
    raise exception 'Episode video generation is currently processing'
      using errcode = '55000';
  end if;

  select count(distinct localization.language_code)
  into ready_languages
  from from_fed_to_chain.episode_localizations localization
  where localization.episode_id = p_episode_id
    and localization.language_code in ('zh-Hant', 'ja', 'en')
    and localization.status = 'completed'
    and nullif(btrim(localization.script), '') is not null
    and nullif(btrim(localization.hls_url), '') is not null
    and (
      localization.language_code <> 'zh-Hant'
      or nullif(btrim(localization.classroom_hls_url), '') is not null
    );

  if ready_languages <> 3 then
    raise exception 'Episode video retry requires completed zh-Hant, ja, and en audio prerequisites'
      using errcode = '22023';
  end if;

  -- A completed shared visual is a valid checkpoint. Keep it and every already
  -- completed language asset; only requeue unfinished localization renders.
  --
  -- Only when it was produced under the version the workers still claim. A
  -- checkpoint from an older visual version is precisely what a version bump
  -- invalidates, so it falls through to the re-plan path below rather than
  -- being stamped back onto the renders.
  if visual_record.status = 'completed'
      and (
        target_visual_version is null
        or visual_record.visual_version = target_visual_version
      ) then
    if visual_record.visual_hash is null then
      raise exception 'Completed episode visual is missing its checkpoint hash'
        using errcode = '23514';
    end if;

    if not exists (
      select 1
      from from_fed_to_chain.episode_videos video
      where video.episode_id = p_episode_id
        and video.status <> 'completed'
    ) then
      raise exception 'Episode video generation is already completed'
        using errcode = '22023';
    end if;

    update from_fed_to_chain.episode_videos video
    set status = 'queued',
        progress_percent = null,
        progress_stage = null,
        visual_hash = visual_record.visual_hash,
        visual_version = visual_record.visual_version,
        manifest = null,
        manifest_hash = null,
        renderer_version = null,
        storyboard_provider = null,
        storyboard_model = null,
        storyboard_prompt_version = null,
        script_hash = null,
        mp4_url = null,
        thumbnail_url = null,
        manifest_url = null,
        captions_ass_url = null,
        r2_prefix = null,
        duration_seconds = null,
        attempt_count = 0,
        next_attempt_at = now(),
        lease_owner = null,
        lease_expires_at = null,
        last_error = null,
        failure_notified_at = null,
        started_at = null,
        completed_at = null,
        updated_at = now()
    where video.episode_id = p_episode_id
      and video.status <> 'completed'
      and not (
        video.status = 'processing'
        and video.lease_expires_at > now()
      );

    -- Post-condition, not a race window patch: the render rows are locked for
    -- this transaction, so nothing can have moved underneath the reset. Assert
    -- the outcome anyway, because the failure it guards against is silent --
    -- a language left 'failed' or 'processing' keeps its exhausted attempt
    -- count, is never claimed again, and the operator was told the retry
    -- succeeded. Everything must now be either an intact completed checkpoint
    -- or a freshly queued render.
    --
    -- Deliberately NOT the '55000' used by the lease conflicts above. Those are
    -- expected states the route answers with a bare 409, so reusing the code
    -- would route an assertion breach into the one path that reports nothing.
    -- Row locks do not block inserts, so a concurrent `enqueue_episode_video`
    -- plus a claim can still reach this; it must arrive as telemetry.
    if exists (
      select 1
      from from_fed_to_chain.episode_videos video
      where video.episode_id = p_episode_id
        and video.status not in ('completed', 'queued')
    ) then
      raise exception 'Episode video retry could not requeue every unfinished render'
        using errcode = '40001';
    end if;

    return true;
  end if;

  -- An incomplete/failed shared visual cannot be reused. Clear downstream
  -- checkpoint references first because episode_videos has a foreign key to
  -- the visual checkpoint tuple, then requeue the shared visual itself.
  update from_fed_to_chain.episode_videos video
  set status = 'queued',
      progress_percent = null,
      progress_stage = null,
      visual_hash = null,
      visual_version = coalesce(
        target_visual_version,
        visual_record.visual_version
      ),
      manifest = null,
      manifest_hash = null,
      renderer_version = null,
      storyboard_provider = null,
      storyboard_model = null,
      storyboard_prompt_version = null,
      script_hash = null,
      mp4_url = null,
      thumbnail_url = null,
      manifest_url = null,
      captions_ass_url = null,
      r2_prefix = null,
      duration_seconds = null,
      attempt_count = 0,
      next_attempt_at = now(),
      lease_owner = null,
      lease_expires_at = null,
      last_error = null,
      failure_notified_at = null,
      started_at = null,
      completed_at = null,
      updated_at = now()
  where video.episode_id = p_episode_id;

  update from_fed_to_chain.episode_video_visuals visual
  set status = 'queued',
      progress_percent = null,
      progress_stage = null,
      visual_payload = null,
      visual_hash = null,
      -- Safe to move only because the render rows above already dropped their
      -- checkpoint hash: the composite FK is not enforced while it is null.
      visual_version = coalesce(
        target_visual_version,
        visual.visual_version
      ),
      r2_prefix = null,
      attempt_count = 0,
      next_attempt_at = now(),
      lease_owner = null,
      lease_expires_at = null,
      last_error = null,
      failure_notified_at = null,
      started_at = null,
      completed_at = null,
      updated_at = now()
  where visual.episode_id = p_episode_id;

  return true;
end;
$$;

revoke execute on function from_fed_to_chain.reset_episode_video_visual_failure_notification()
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.reset_episode_video_visual_failure_notification()
  to service_role;

revoke execute on function from_fed_to_chain.reap_failed_episode_video_visual_notifications(integer)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.reap_failed_episode_video_visual_notifications(integer)
  to service_role;

revoke execute on function from_fed_to_chain.mark_episode_video_visual_failure_notified(uuid)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.mark_episode_video_visual_failure_notified(uuid)
  to service_role;

-- The single-argument signature existed only inside this branch; drop it so the
-- overload cannot be resolved with the version argument silently omitted.
drop function if exists from_fed_to_chain.retry_episode_video_generation(uuid);

revoke execute on function from_fed_to_chain.retry_episode_video_generation(uuid, text)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.retry_episode_video_generation(uuid, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
