-- Collapse the mobile podcast feed's cross-region enrichment into one PostgREST
-- request. The API runs in Fly IAD while the shared Supabase project is in Tokyo,
-- so the previous feed + video + visual-progress + classroom-audio requests paid
-- several trans-Pacific round trips for every cold feed load.
--
-- Page first, then enrich only those rows. This shape is important: aggregating
-- classrooms before the LIMIT makes PostgreSQL do substantially more work.
create or replace function from_fed_to_chain.list_episode_feed_page_v1(
  p_limit integer,
  p_language_code text,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  episode_id uuid,
  localization_id uuid,
  title text,
  language_code text,
  hls_url text,
  classroom_hls_url text,
  llm_model text,
  llm_thinking_model text,
  llm_provider text,
  status text,
  created_at timestamptz,
  video_status text,
  video_progress_percent smallint,
  video_progress_stage text,
  video_updated_at timestamptz,
  video_mp4_url text,
  video_thumbnail_url text,
  video_duration_seconds double precision,
  visual_status text,
  visual_progress_percent smallint,
  visual_progress_stage text,
  visual_updated_at timestamptz,
  classroom_audio jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with page as materialized (
    select
      e.id,
      e.id as episode_id,
      el.id as localization_id,
      el.title,
      el.language_code,
      el.hls_url,
      el.classroom_hls_url,
      el.llm_model,
      el.llm_thinking_model,
      el.llm_provider,
      el.status,
      e.created_at
    from from_fed_to_chain.episodes e
    join from_fed_to_chain.episode_localizations el
      on el.episode_id = e.id
    where el.status = 'completed'
      and nullif(btrim(el.hls_url), '') is not null
      and (
        el.language_code <> 'zh-Hant'
        or nullif(btrim(el.classroom_hls_url), '') is not null
      )
      and el.language_code = p_language_code
      and (
        (p_cursor_created_at is null and p_cursor_id is null)
        or (
          p_cursor_created_at is not null
          and p_cursor_id is not null
          and (
            e.created_at < p_cursor_created_at
            or (
              e.created_at = p_cursor_created_at
              and e.id < p_cursor_id
            )
          )
        )
      )
    order by e.created_at desc, e.id desc
    limit least(greatest(coalesce(p_limit, 21), 1), 51)
  )
  select
    p.id,
    p.episode_id,
    p.localization_id,
    p.title,
    p.language_code,
    p.hls_url,
    p.classroom_hls_url,
    p.llm_model,
    p.llm_thinking_model,
    p.llm_provider,
    p.status,
    p.created_at,
    ev.status as video_status,
    ev.progress_percent as video_progress_percent,
    ev.progress_stage as video_progress_stage,
    ev.updated_at as video_updated_at,
    ev.mp4_url as video_mp4_url,
    ev.thumbnail_url as video_thumbnail_url,
    ev.duration_seconds as video_duration_seconds,
    vv.status as visual_status,
    vv.progress_percent as visual_progress_percent,
    vv.progress_stage as visual_progress_stage,
    vv.updated_at as visual_updated_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'languageCode', lc.target_language_code,
          'hlsUrl', lc.hls_url
        )
        order by lc.target_language_code
      ) filter (where lc.episode_localization_id is not null),
      '[]'::jsonb
    ) as classroom_audio
  from page p
  left join from_fed_to_chain.episode_videos ev
    on ev.episode_localization_id = p.localization_id
  left join from_fed_to_chain.episode_video_visuals vv
    on vv.episode_id = p.episode_id
   and ev.status = 'queued'
  left join from_fed_to_chain.language_classrooms lc
    on lc.episode_localization_id = p.localization_id
   and nullif(btrim(lc.hls_url), '') is not null
  group by
    p.id,
    p.episode_id,
    p.localization_id,
    p.title,
    p.language_code,
    p.hls_url,
    p.classroom_hls_url,
    p.llm_model,
    p.llm_thinking_model,
    p.llm_provider,
    p.status,
    p.created_at,
    ev.status,
    ev.progress_percent,
    ev.progress_stage,
    ev.updated_at,
    ev.mp4_url,
    ev.thumbnail_url,
    ev.duration_seconds,
    vv.status,
    vv.progress_percent,
    vv.progress_stage,
    vv.updated_at
  order by p.created_at desc, p.id desc;
$$;

comment on function from_fed_to_chain.list_episode_feed_page_v1(integer, text, timestamptz, uuid)
is 'Pages published podcast localizations first, then hydrates video progress and classroom audio in one database round trip.';

revoke execute on function from_fed_to_chain.list_episode_feed_page_v1(integer, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.list_episode_feed_page_v1(integer, text, timestamptz, uuid)
  to service_role;
