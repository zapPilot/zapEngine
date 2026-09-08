begin;

create table if not exists from_fed_to_chain.episode_video_reviews (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references from_fed_to_chain.episodes(id) on delete cascade,
  visual_hash text,
  language_code text check (language_code is null or language_code in ('zh-Hant', 'ja', 'en')),
  scene_id text check (scene_id is null or scene_id ~ '^scene-[0-9]{2,3}$'),
  reviewer text not null check (reviewer in ('operator', 'agent')),
  verdict text not null check (verdict in ('good', 'acceptable', 'bad')),
  issue_categories text[] not null default '{}'::text[] check (
    issue_categories <@ array[
      'wrong-subject', 'irrelevant-stock', 'text-heavy', 'low-quality',
      'repeated-image', 'abstract-no-image', 'caption-timing', 'thumbnail',
      'audio', 'other'
    ]::text[]
  ),
  note text check (note is null or length(note) <= 2000),
  pipeline_context jsonb not null default '{}'::jsonb check (
    jsonb_typeof(pipeline_context) = 'object'
    and octet_length(pipeline_context::text) <= 8192
  ),
  status text not null default 'open' check (status in ('open', 'triaged', 'resolved')),
  resolution_note text check (resolution_note is null or length(resolution_note) <= 2000),
  resolved_by text check (resolved_by is null or resolved_by in ('operator', 'agent')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint episode_video_reviews_resolution_pair check (
    (status = 'resolved' and resolved_at is not null and resolved_by is not null)
    or status <> 'resolved'
  )
);

create unique index if not exists episode_video_reviews_scope_unique
  on from_fed_to_chain.episode_video_reviews (
    episode_id,
    coalesce(visual_hash, ''),
    coalesce(language_code, ''),
    coalesce(scene_id, ''),
    reviewer
  );
create index if not exists episode_video_reviews_status_created_idx
  on from_fed_to_chain.episode_video_reviews (status, created_at desc);

alter table from_fed_to_chain.episode_video_reviews enable row level security;
revoke all on from_fed_to_chain.episode_video_reviews from public, anon, authenticated;
grant all on from_fed_to_chain.episode_video_reviews to service_role;

drop policy if exists "Service role can manage episode video reviews"
  on from_fed_to_chain.episode_video_reviews;
create policy "Service role can manage episode video reviews"
  on from_fed_to_chain.episode_video_reviews
  for all to service_role using (true) with check (true);

create or replace function from_fed_to_chain.upsert_episode_video_review(
  p_episode_id uuid,
  p_visual_hash text,
  p_language_code text,
  p_scene_id text,
  p_reviewer text,
  p_verdict text,
  p_issue_categories text[],
  p_note text,
  p_pipeline_context jsonb
)
returns from_fed_to_chain.episode_video_reviews
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_review from_fed_to_chain.episode_video_reviews;
begin
  insert into from_fed_to_chain.episode_video_reviews (
    episode_id, visual_hash, language_code, scene_id, reviewer, verdict,
    issue_categories, note, pipeline_context, status, resolution_note,
    resolved_by, resolved_at
  ) values (
    p_episode_id,
    nullif(btrim(coalesce(p_visual_hash, '')), ''),
    nullif(btrim(coalesce(p_language_code, '')), ''),
    nullif(btrim(coalesce(p_scene_id, '')), ''),
    p_reviewer,
    p_verdict,
    coalesce(p_issue_categories, '{}'::text[]),
    nullif(btrim(coalesce(p_note, '')), ''),
    coalesce(p_pipeline_context, '{}'::jsonb),
    'open', null, null, null
  )
  on conflict (
    episode_id,
    (coalesce(visual_hash, '')),
    (coalesce(language_code, '')),
    (coalesce(scene_id, '')),
    reviewer
  ) do update set
    verdict = excluded.verdict,
    issue_categories = excluded.issue_categories,
    note = excluded.note,
    pipeline_context = excluded.pipeline_context,
    status = 'open',
    resolution_note = null,
    resolved_by = null,
    resolved_at = null,
    updated_at = now()
  returning * into v_review;
  return v_review;
end;
$$;

create or replace function from_fed_to_chain.resolve_episode_video_review(
  p_review_id uuid,
  p_status text,
  p_resolution_note text,
  p_resolved_by text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_rows integer;
begin
  if p_status not in ('triaged', 'resolved') then
    raise exception 'Review status must be triaged or resolved' using errcode = '22023';
  end if;
  if p_resolved_by not in ('operator', 'agent') then
    raise exception 'Review resolver must be operator or agent' using errcode = '22023';
  end if;

  update from_fed_to_chain.episode_video_reviews review
  set status = p_status,
      resolution_note = nullif(btrim(coalesce(p_resolution_note, '')), ''),
      resolved_by = p_resolved_by,
      resolved_at = case when p_status = 'resolved' then now() else null end,
      updated_at = now()
  where review.id = p_review_id;
  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end;
$$;

revoke execute on function from_fed_to_chain.upsert_episode_video_review(uuid, text, text, text, text, text, text[], text, jsonb)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.upsert_episode_video_review(uuid, text, text, text, text, text, text[], text, jsonb)
  to service_role;
revoke execute on function from_fed_to_chain.resolve_episode_video_review(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function from_fed_to_chain.resolve_episode_video_review(uuid, text, text, text)
  to service_role;

notify pgrst, 'reload schema';
commit;
