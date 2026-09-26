-- Run with psql --no-psqlrc -v ON_ERROR_STOP=1 after local migration reset.
begin;
set local statement_timeout = '10s';
do $$
declare
  first_episode uuid := gen_random_uuid();
  second_episode uuid := gen_random_uuid();
  first_action uuid;
  affected integer;
  claim uuid := gen_random_uuid();
  demo_wallet text := '0x1111111111111111111111111111111111111111';
begin
  insert into from_fed_to_chain.episodes(id, source_url) values
    (first_episode, 'https://example.invalid/news-agent-test-1'),
    (second_episode, 'https://example.invalid/news-agent-test-2');
  insert into from_fed_to_chain.news_agent_actions(episode_id, rule_version)
    values (first_episode, 'migration-test/arm') returning id into first_action;
  insert into from_fed_to_chain.news_agent_actions(episode_id, rule_version)
    values (first_episode, 'migration-test/arm')
    on conflict (episode_id, rule_version) do nothing;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Discovery was not idempotent'; end if;

  update from_fed_to_chain.news_agent_actions set status = 'approved' where id = first_action;
  update from_fed_to_chain.news_agent_actions
    set status = 'submitting', claim_token = claim, wallet_address = demo_wallet
    where id = first_action and status = 'approved';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'First claim failed'; end if;
  update from_fed_to_chain.news_agent_actions set claim_token = gen_random_uuid()
    where id = first_action and status = 'approved';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Second claimant replaced owner'; end if;

  begin
    insert into from_fed_to_chain.news_agent_actions(episode_id, rule_version, status)
      values (second_episode, 'migration-test/arm', 'submitting');
    raise exception 'Arm permitted a second attempt';
  exception when unique_violation then null;
  end;
  begin
    insert into from_fed_to_chain.news_agent_actions(episode_id, rule_version, status, wallet_address)
      values (second_episode, 'migration-test/other-arm', 'submitting', demo_wallet);
    raise exception 'Wallet permitted concurrent nonce allocation';
  exception when unique_violation then null;
  end;
  update from_fed_to_chain.news_agent_actions set status = 'confirmed' where id = first_action;
  begin
    insert into from_fed_to_chain.news_agent_actions(episode_id, rule_version, status)
      values (second_episode, 'migration-test/arm', 'confirmed');
    raise exception 'Completed arm could be reused';
  exception when unique_violation then null;
  end;
  insert into from_fed_to_chain.news_agent_actions(episode_id, rule_version, status)
    values (second_episode, 'migration-test/arm', 'blocked');
  begin
    delete from from_fed_to_chain.episodes where id = first_episode;
    raise exception 'Episode deletion erased execution evidence';
  exception when foreign_key_violation then null;
  end;
  begin
    update from_fed_to_chain.news_agent_actions set chain_id = 1 where id = first_action;
    raise exception 'Non-Base chain accepted';
  exception when check_violation then null;
  end;
  begin
    update from_fed_to_chain.news_agent_actions set steps = '{}'::jsonb where id = first_action;
    raise exception 'Non-array steps accepted';
  exception when check_violation then null;
  end;
  if has_table_privilege('anon', 'from_fed_to_chain.news_agent_actions', 'SELECT')
    or has_table_privilege('authenticated', 'from_fed_to_chain.news_agent_actions', 'UPDATE') then
    raise exception 'Public access to execution evidence';
  end if;
  if not has_table_privilege('service_role', 'from_fed_to_chain.news_agent_actions', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Service role lacks explicit grants';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'from_fed_to_chain.news_agent_actions'::regclass) then
    raise exception 'Execution table lacks RLS';
  end if;
  raise notice 'News agent idempotency, arm exclusion, wallet exclusion, CAS, FK, checks and grants verified';
end;
$$;
rollback;
