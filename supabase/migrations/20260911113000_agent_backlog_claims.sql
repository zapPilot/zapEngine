begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table ops.agent_backlog_claims (
  id uuid primary key default gen_random_uuid(),
  repo text not null,
  issue_number bigint not null check (issue_number > 0),
  agent_id text not null,
  claimed_at timestamptz not null default now(),
  lease_expires_at timestamptz not null,
  released_at timestamptz,
  release_outcome text check (release_outcome in ('released','blocked','lease-expired')),
  release_reason text,
  check (lease_expires_at > claimed_at)
);

create unique index agent_backlog_one_live_claim
  on ops.agent_backlog_claims(repo, issue_number)
  where released_at is null;
create index agent_backlog_claim_expiry
  on ops.agent_backlog_claims(lease_expires_at)
  where released_at is null;

alter table ops.agent_backlog_claims enable row level security;
revoke all on ops.agent_backlog_claims from public, anon, authenticated, service_role;

create function from_fed_to_chain.ops_agent_backlog_claims()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'claimId', id,
    'issueNumber', issue_number,
    'agentId', agent_id,
    'claimedAt', claimed_at,
    'leaseExpiresAt', lease_expires_at
  ) order by claimed_at), '[]'::jsonb)
  from ops.agent_backlog_claims
  where repo = 'zapPilot/zapEngine'
    and released_at is null
    and lease_expires_at > now();
$$;

create function from_fed_to_chain.ops_claim_agent_backlog(
  p_repo text,
  p_issue_numbers bigint[],
  p_agent_id text,
  p_lease_seconds integer default 3600
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_issue bigint;
  created ops.agent_backlog_claims%rowtype;
begin
  if p_repo <> 'zapPilot/zapEngine' then
    raise exception 'Unsupported backlog repository';
  end if;
  if p_agent_id !~ '^[a-zA-Z0-9_.:/-]{1,120}$' then
    raise exception 'Invalid agent id';
  end if;
  if p_lease_seconds not between 300 and 14400 then
    raise exception 'Lease must be between 300 and 14400 seconds';
  end if;
  if coalesce(array_length(p_issue_numbers, 1), 0) = 0
    or array_length(p_issue_numbers, 1) > 100 then
    raise exception 'Candidate issue list must contain 1 to 100 items';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ops.agent_backlog_claims:' || p_repo, 0));

  update ops.agent_backlog_claims
  set released_at = now(),
      release_outcome = 'lease-expired',
      release_reason = 'Lease expired before a later claim attempt.'
  where repo = p_repo
    and released_at is null
    and lease_expires_at <= now();

  select candidate.issue_number
  into selected_issue
  from unnest(p_issue_numbers) with ordinality candidate(issue_number, ord)
  where candidate.issue_number > 0
    and not exists (
      select 1
      from ops.agent_backlog_claims existing
      where existing.repo = p_repo
        and existing.issue_number = candidate.issue_number
        and existing.released_at is null
    )
  order by candidate.ord
  limit 1;

  if selected_issue is null then
    return null;
  end if;

  insert into ops.agent_backlog_claims(
    repo, issue_number, agent_id, lease_expires_at
  ) values (
    p_repo, selected_issue, p_agent_id, now() + make_interval(secs => p_lease_seconds)
  ) returning * into created;

  return jsonb_build_object(
    'claimId', created.id,
    'issueNumber', created.issue_number,
    'agentId', created.agent_id,
    'claimedAt', created.claimed_at,
    'leaseExpiresAt', created.lease_expires_at
  );
end;
$$;

create function from_fed_to_chain.ops_release_agent_backlog(
  p_claim_id uuid,
  p_agent_id text,
  p_outcome text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome not in ('released','blocked') then
    raise exception 'Invalid backlog release outcome';
  end if;
  if length(trim(p_reason)) not between 8 and 500 then
    raise exception 'Backlog release reason must be 8 to 500 characters';
  end if;

  update ops.agent_backlog_claims
  set released_at = now(),
      release_outcome = p_outcome,
      release_reason = trim(p_reason)
  where id = p_claim_id
    and agent_id = p_agent_id
    and released_at is null
    and lease_expires_at > now();

  return found;
end;
$$;

revoke all on function from_fed_to_chain.ops_agent_backlog_claims(),
  from_fed_to_chain.ops_claim_agent_backlog(text,bigint[],text,integer),
  from_fed_to_chain.ops_release_agent_backlog(uuid,text,text,text)
  from public, anon, authenticated;

grant execute on function from_fed_to_chain.ops_agent_backlog_claims(),
  from_fed_to_chain.ops_claim_agent_backlog(text,bigint[],text,integer),
  from_fed_to_chain.ops_release_agent_backlog(uuid,text,text,text)
  to service_role;

commit;
