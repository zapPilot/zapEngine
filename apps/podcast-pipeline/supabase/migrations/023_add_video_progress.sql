begin;

-- Migration 023: persist video-generation progress so the app can draw a
-- determinate progress bar.
--
-- Before this, the only signal a client could see was the four-value `status`.
-- The render process already computes real progress (scene i of n, ffmpeg's
-- output clock) but it went only to stdout, and the render group has no HTTP
-- service and stops when idle, so the database is the only channel out of it.
--
-- Both columns are nullable with no default: "0%" and "nothing reported yet"
-- are different facts, and the API derives a value for every non-processing
-- state anyway, so a backfill would only invent history.
--
-- The stage whitelist is deliberately a CHECK rather than free text, because
-- `progress_stage` reaches the public episode API and the app maps it to
-- display copy. An open string would force every client version to cope with
-- values it has never heard of, forever.

alter table from_fed_to_chain.episode_video_visuals
  add column if not exists progress_percent smallint,
  add column if not exists progress_stage text;

alter table from_fed_to_chain.episode_videos
  add column if not exists progress_percent smallint,
  add column if not exists progress_stage text;

alter table from_fed_to_chain.episode_video_visuals
  drop constraint if exists episode_video_visuals_progress_percent_range;
alter table from_fed_to_chain.episode_video_visuals
  add constraint episode_video_visuals_progress_percent_range check (
    progress_percent is null
    or (progress_percent >= 0 and progress_percent <= 100)
  );

alter table from_fed_to_chain.episode_video_visuals
  drop constraint if exists episode_video_visuals_progress_stage_known;
alter table from_fed_to_chain.episode_video_visuals
  add constraint episode_video_visuals_progress_stage_known check (
    progress_stage is null
    or progress_stage in (
      'analyzing-audio',
      'planning-scenes',
      'selecting-images',
      'uploading-visuals'
    )
  );

alter table from_fed_to_chain.episode_videos
  drop constraint if exists episode_videos_progress_percent_range;
alter table from_fed_to_chain.episode_videos
  add constraint episode_videos_progress_percent_range check (
    progress_percent is null
    or (progress_percent >= 0 and progress_percent <= 100)
  );

alter table from_fed_to_chain.episode_videos
  drop constraint if exists episode_videos_progress_stage_known;
alter table from_fed_to_chain.episode_videos
  add constraint episode_videos_progress_stage_known check (
    progress_stage is null
    or progress_stage in (
      'analyzing-audio',
      'aligning-script',
      'preparing-media',
      'encoding',
      'uploading-video'
    )
  );

-- Progress reporting must never be able to fail a render, so both RPCs are
-- forgiving in one specific way: a stage outside this migration's whitelist is
-- normalized to null instead of raising. That is what lets a newly deployed
-- worker run against a not-yet-migrated database and merely lose the label.
--
-- The lease fence is otherwise identical to renew_episode_video*_lease. A
-- progress write from a worker that has lost its lease is exactly as unwanted
-- as a lease renewal from one, and the monotonic clamp lives here rather than
-- in TypeScript so no out-of-order flush can ever walk the bar backwards.

create or replace function from_fed_to_chain.report_episode_video_visual_progress(
  p_episode_id uuid,
  p_lease_owner text,
  p_percent integer,
  p_stage text
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
  set progress_percent = greatest(
        coalesce(visual.progress_percent, 0),
        least(greatest(coalesce(p_percent, 0), 0), 100)
      ),
      progress_stage = case
        -- A stale report that loses the monotonic clamp must not drag the label
        -- back either, or the client renders a percentage from one stage beside
        -- the name of an earlier one.
        when coalesce(p_percent, 0) < coalesce(visual.progress_percent, 0)
          then visual.progress_stage
        when p_stage in (
          'analyzing-audio',
          'planning-scenes',
          'selecting-images',
          'uploading-visuals'
        ) then p_stage
        else null
      end,
      updated_at = now()
  where visual.episode_id = p_episode_id
    and visual.status = 'processing'
    and visual.lease_owner = p_lease_owner
    and visual.lease_expires_at > now();

  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end;
$$;

create or replace function from_fed_to_chain.report_episode_video_progress(
  p_episode_localization_id uuid,
  p_lease_owner text,
  p_percent integer,
  p_stage text
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
  set progress_percent = greatest(
        coalesce(video.progress_percent, 0),
        least(greatest(coalesce(p_percent, 0), 0), 100)
      ),
      progress_stage = case
        when coalesce(p_percent, 0) < coalesce(video.progress_percent, 0)
          then video.progress_stage
        when p_stage in (
          'analyzing-audio',
          'aligning-script',
          'preparing-media',
          'encoding',
          'uploading-video'
        ) then p_stage
        else null
      end,
      updated_at = now()
  where video.episode_localization_id = p_episode_localization_id
    and video.status = 'processing'
    and video.lease_owner = p_lease_owner
    and video.lease_expires_at > now()
    and exists (
      select 1
      from from_fed_to_chain.episode_video_visuals visual
      where visual.episode_id = video.episode_id
        and visual.status = 'completed'
        and visual.visual_hash = video.visual_hash
        and visual.visual_version = video.visual_version
    );

  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end;
$$;

-- A claim starts an attempt from scratch, so the previous attempt's progress
-- must not survive into it. Only the `set` lists change here; every `where`
-- clause is untouched, so evaluatePendingRenderWork in
-- src/services/render-capacity.ts still mirrors these claims exactly.
--
-- The expired-lease reap above each claim deliberately keeps the stored value:
-- a row it pushes to 'failed' should report the last percentage it reached.

create or replace function from_fed_to_chain.claim_episode_video_visual_v2(
  p_lease_owner text,
  p_visual_version text
)
returns setof from_fed_to_chain.episode_video_visuals
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(p_lease_owner), '') is null then
    raise exception 'p_lease_owner must not be empty'
      using errcode = '22023';
  end if;

  if nullif(btrim(p_visual_version), '') is null then
    raise exception 'p_visual_version must not be empty'
      using errcode = '22023';
  end if;

  update from_fed_to_chain.episode_video_visuals visual
  set status = case
        when visual.attempt_count >= 3 then 'failed'
        else 'queued'
      end,
      next_attempt_at = case visual.attempt_count
        when 1 then now() + interval '1 minute'
        when 2 then now() + interval '5 minutes'
        else now()
      end,
      lease_owner = null,
      lease_expires_at = null,
      last_error = coalesce(visual.last_error, 'Worker lease expired'),
      updated_at = now()
  where visual.status = 'processing'
    and visual.lease_expires_at <= now();

  return query
  with candidate as (
    select visual.episode_id
    from from_fed_to_chain.episode_video_visuals visual
    where visual.status = 'queued'
      and visual.next_attempt_at <= now()
      and visual.attempt_count < 3
      and visual.visual_version = btrim(p_visual_version)
    order by visual.next_attempt_at, visual.created_at
    limit 1
    for update skip locked
  )
  update from_fed_to_chain.episode_video_visuals visual
  set status = 'processing',
      attempt_count = visual.attempt_count + 1,
      lease_owner = btrim(p_lease_owner),
      lease_expires_at = now() + interval '10 minutes',
      started_at = coalesce(visual.started_at, now()),
      progress_percent = null,
      progress_stage = null,
      updated_at = now()
  from candidate
  where visual.episode_id = candidate.episode_id
  returning visual.*;
end;
$$;

create or replace function from_fed_to_chain.claim_episode_video_v2(
  p_lease_owner text,
  p_visual_version text
)
returns setof from_fed_to_chain.episode_videos
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(p_lease_owner), '') is null then
    raise exception 'p_lease_owner must not be empty'
      using errcode = '22023';
  end if;

  if nullif(btrim(p_visual_version), '') is null then
    raise exception 'p_visual_version must not be empty'
      using errcode = '22023';
  end if;

  update from_fed_to_chain.episode_videos video
  set status = case
        when video.attempt_count >= 3 then 'failed'
        else 'queued'
      end,
      next_attempt_at = case video.attempt_count
        when 1 then now() + interval '1 minute'
        when 2 then now() + interval '5 minutes'
        else now()
      end,
      lease_owner = null,
      lease_expires_at = null,
      last_error = coalesce(video.last_error, 'Worker lease expired'),
      updated_at = now()
  where video.status = 'processing'
    and video.lease_expires_at <= now();

  return query
  with candidate as (
    select video.episode_localization_id
    from from_fed_to_chain.episode_videos video
    join from_fed_to_chain.episode_video_visuals visual
      on visual.episode_id = video.episode_id
      and visual.visual_hash = video.visual_hash
      and visual.visual_version = video.visual_version
    join from_fed_to_chain.episode_localizations localization
      on localization.id = video.episode_localization_id
    where video.status = 'queued'
      and video.next_attempt_at <= now()
      and video.attempt_count < 3
      and video.visual_version = btrim(p_visual_version)
      and visual.status = 'completed'
      and localization.language_code in ('zh-Hant', 'ja', 'en')
      and localization.status = 'completed'
      and nullif(btrim(localization.script), '') is not null
      and nullif(btrim(localization.hls_url), '') is not null
      and (
        localization.language_code <> 'zh-Hant'
        or nullif(btrim(localization.classroom_hls_url), '') is not null
      )
    order by video.next_attempt_at, video.created_at
    limit 1
    for update of video skip locked
  )
  update from_fed_to_chain.episode_videos video
  set status = 'processing',
      attempt_count = video.attempt_count + 1,
      lease_owner = btrim(p_lease_owner),
      lease_expires_at = now() + interval '10 minutes',
      started_at = coalesce(video.started_at, now()),
      progress_percent = null,
      progress_stage = null,
      updated_at = now()
  from candidate
  where video.episode_localization_id = candidate.episode_localization_id
  returning video.*;
end;
$$;

revoke execute on function from_fed_to_chain.report_episode_video_visual_progress(
  uuid,
  text,
  integer,
  text
) from public, anon, authenticated;
grant execute on function from_fed_to_chain.report_episode_video_visual_progress(
  uuid,
  text,
  integer,
  text
) to service_role;

revoke execute on function from_fed_to_chain.report_episode_video_progress(
  uuid,
  text,
  integer,
  text
) from public, anon, authenticated;
grant execute on function from_fed_to_chain.report_episode_video_progress(
  uuid,
  text,
  integer,
  text
) to service_role;

-- New *columns* need this as much as new functions do. Without it PostgREST
-- keeps serving a schema cache that has never heard of progress_percent, and
-- every select naming it fails with 42703 — which takes down the whole episode
-- feed, not just the video tab.
notify pgrst, 'reload schema';

commit;
