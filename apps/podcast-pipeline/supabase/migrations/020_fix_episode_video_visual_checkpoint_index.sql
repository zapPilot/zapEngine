begin;

drop index if exists
  from_fed_to_chain.idx_episode_videos_visual_checkpoint;

create index idx_episode_videos_visual_checkpoint
  on from_fed_to_chain.episode_videos (
    episode_id,
    visual_hash,
    visual_version
  );

commit;
