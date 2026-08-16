begin;

-- X and Threads now publish native video, so their telemetry rows may carry
-- the duration of the media actually delivered to the platform. Keep NULL
-- valid for pre-migration rows and future text-only posts; Rednote remains
-- strictly video-backed and therefore still requires a positive duration.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table from_fed_to_chain.social_posts
  drop constraint if exists social_posts_video_matches_platform;

alter table from_fed_to_chain.social_posts
  add constraint social_posts_video_matches_platform check (
    (
      platform = 'rednote'
      and video_duration_sec is not null
      and video_duration_sec > 0
    )
    or (
      platform <> 'rednote'
      and (
        video_duration_sec is null
        or video_duration_sec > 0
      )
    )
  );

notify pgrst, 'reload schema';

commit;
