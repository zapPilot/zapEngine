begin;

revoke select on from_fed_to_chain.user_episode_state
  from anon, authenticated;
revoke select (user_id, episode_id, listened, last_position_seconds, updated_at)
  on from_fed_to_chain.user_episode_state from anon, authenticated;

grant select (user_id, episode_id, listened, last_position_seconds)
  on from_fed_to_chain.user_episode_state to anon, authenticated;

notify pgrst, 'reload schema';

commit;
