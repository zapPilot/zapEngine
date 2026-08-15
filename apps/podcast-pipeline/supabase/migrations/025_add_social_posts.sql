begin;

-- Migration 025: social publishing telemetry for the AI content-learning loop.
--
-- social_posts records what actually went out per platform: the last
-- AI-generated copy vs the human-reviewed copy that was published, the post
-- identity when the platform reports one (Rednote never does), and the content
-- taxonomy generated together with the copy. social_post_metrics is an
-- append-only snapshot series to be filled by a later manual ingestion CLI;
-- only the table ships now. Neither table is read by any app surface -- the
-- consumer is a future AI analyst querying through the service role.
--
-- Deliberately no unique (episode_id, platform): a future repost of the same
-- episode is a legitimate second row. The local state file at
-- ~/.zap-pilot/social-publisher.json remains the duplicate-publish guard.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table from_fed_to_chain.social_posts (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null
    references from_fed_to_chain.episodes(id) on delete cascade,
  platform text not null
    check (platform in ('x', 'threads', 'rednote')),
  post_url text,
  platform_post_id text,
  published_at timestamptz not null,
  -- Taxonomy values are app-validated closed TypeScript unions, not database
  -- CHECKs: the taxonomy will evolve and old rows must stay readable.
  topic text not null
    check (nullif(btrim(topic), '') is not null),
  hook_type text not null
    check (nullif(btrim(hook_type), '') is not null),
  generated_title text,
  published_title text,
  generated_body text not null
    check (nullif(btrim(generated_body), '') is not null),
  published_body text not null
    check (nullif(btrim(published_body), '') is not null),
  -- Hashtags as actually published. Only Rednote has a hashtag field; inline
  -- X hashtags live inside the body text.
  hashtags text[] not null default '{}',
  -- Set only when the post itself carried the video (Rednote). X and Threads
  -- publish a link whose target page has the video, so they stay null.
  video_duration_sec double precision,
  content_features jsonb not null default '{}'::jsonb,
  llm_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_posts_post_url_not_blank check (
    post_url is null or btrim(post_url) <> ''
  ),
  constraint social_posts_platform_post_id_not_blank check (
    platform_post_id is null or btrim(platform_post_id) <> ''
  ),
  constraint social_posts_features_is_object check (
    jsonb_typeof(content_features) = 'object'
  ),
  constraint social_posts_title_matches_platform check (
    (
      platform = 'rednote'
      and nullif(btrim(generated_title), '') is not null
      and nullif(btrim(published_title), '') is not null
    )
    or (
      platform <> 'rednote'
      and generated_title is null
      and published_title is null
    )
  ),
  constraint social_posts_hashtags_match_platform check (
    platform = 'rednote' or hashtags = '{}'
  ),
  constraint social_posts_video_matches_platform check (
    (
      platform = 'rednote'
      and video_duration_sec is not null
      and video_duration_sec > 0
    )
    or (
      platform <> 'rednote'
      and video_duration_sec is null
    )
  )
);

create index idx_social_posts_episode_platform
  on from_fed_to_chain.social_posts (episode_id, platform);

create table from_fed_to_chain.social_post_metrics (
  id uuid primary key default gen_random_uuid(),
  social_post_id uuid not null
    references from_fed_to_chain.social_posts(id) on delete cascade,
  captured_at timestamptz not null default now(),
  age_hours numeric not null check (age_hours >= 0),
  -- Counts are nullable on purpose: platforms expose different subsets and a
  -- gap is a fact worth keeping distinct from zero.
  views integer check (views >= 0),
  impressions integer check (impressions >= 0),
  likes integer check (likes >= 0),
  comments integer check (comments >= 0),
  shares integer check (shares >= 0),
  saves integer check (saves >= 0),
  profile_visits integer check (profile_visits >= 0),
  -- Net delta, so it may be negative.
  followers_gained integer,
  created_at timestamptz not null default now()
);

create index idx_social_post_metrics_post_captured
  on from_fed_to_chain.social_post_metrics (social_post_id, captured_at);

alter table from_fed_to_chain.social_posts enable row level security;
alter table from_fed_to_chain.social_post_metrics enable row level security;

create policy "Service role can manage social posts"
  on from_fed_to_chain.social_posts for all to service_role
  using (true) with check (true);

create policy "Service role can manage social post metrics"
  on from_fed_to_chain.social_post_metrics for all to service_role
  using (true) with check (true);

grant all on from_fed_to_chain.social_posts to service_role;
grant all on from_fed_to_chain.social_post_metrics to service_role;
revoke all on from_fed_to_chain.social_posts
  from public, anon, authenticated;
revoke all on from_fed_to_chain.social_post_metrics
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
