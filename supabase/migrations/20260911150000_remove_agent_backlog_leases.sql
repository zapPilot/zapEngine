begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop function if exists from_fed_to_chain.ops_renew_agent_backlog(uuid,text,integer);
drop function if exists from_fed_to_chain.ops_release_agent_backlog(uuid,text,bigint,text,text);
drop function if exists from_fed_to_chain.ops_claim_agent_backlog(bigint[],text,integer);
drop function if exists from_fed_to_chain.ops_agent_backlog_claims();

drop table if exists ops.agent_backlog_claims;

notify pgrst, 'reload schema';

commit;
