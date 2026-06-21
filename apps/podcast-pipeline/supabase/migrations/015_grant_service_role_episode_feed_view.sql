grant usage on schema from_fed_to_chain to service_role;
grant select on from_fed_to_chain.episodes_with_stats to service_role;
grant select on from_fed_to_chain.episodes to service_role;
grant select on from_fed_to_chain.episode_localizations to service_role;
grant select on from_fed_to_chain.likes to service_role;
notify pgrst, 'reload schema';