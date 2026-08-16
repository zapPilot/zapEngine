begin;

-- YouTube joins the social publisher as a full-video platform. Preserve the
-- original 025/026 migrations and evolve the live constraints in place.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table from_fed_to_chain.social_posts
  drop constraint if exists social_posts_platform_check;

alter table from_fed_to_chain.social_posts
  add constraint social_posts_platform_check check (
    platform in ('x', 'threads', 'rednote', 'youtube')
  );

alter table from_fed_to_chain.social_posts
  drop constraint if exists social_posts_title_matches_platform;

alter table from_fed_to_chain.social_posts
  add constraint social_posts_title_matches_platform check (
    (
      platform in ('rednote', 'youtube')
      and nullif(btrim(generated_title), '') is not null
      and nullif(btrim(published_title), '') is not null
    )
    or (
      platform not in ('rednote', 'youtube')
      and generated_title is null
      and published_title is null
    )
  );

alter table from_fed_to_chain.social_posts
  drop constraint if exists social_posts_video_matches_platform;

alter table from_fed_to_chain.social_posts
  add constraint social_posts_video_matches_platform check (
    (
      platform in ('rednote', 'youtube')
      and video_duration_sec is not null
      and video_duration_sec > 0
    )
    or (
      platform not in ('rednote', 'youtube')
      and (
        video_duration_sec is null
        or video_duration_sec > 0
      )
    )
  );

notify pgrst, 'reload schema';

commit;
