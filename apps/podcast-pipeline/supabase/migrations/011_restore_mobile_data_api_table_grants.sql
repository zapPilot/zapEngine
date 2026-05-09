begin;

grant select, insert, update, delete
  on from_fed_to_chain.likes to anon, authenticated;

revoke delete
  on from_fed_to_chain.user_episode_state from anon, authenticated;

grant select, insert, update
  on from_fed_to_chain.user_episode_state to anon, authenticated;

notify pgrst, 'reload schema';

commit;
