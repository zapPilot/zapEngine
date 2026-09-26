begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table from_fed_to_chain.news_agent_actions (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references from_fed_to_chain.episodes(id) on delete restrict,
  rule_version text not null,
  status text not null default 'pending' check (status in (
    'pending', 'skipped', 'approved', 'blocked', 'submitting', 'submitted',
    'confirmed', 'failed', 'needs_attention'
  )),
  decision jsonb,
  review jsonb,
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  wallet_address text check (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  chain_id integer not null default 8453 check (chain_id = 8453),
  claim_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (episode_id, rule_version)
);

create unique index news_agent_actions_arm_attempt_idx
  on from_fed_to_chain.news_agent_actions (rule_version)
  where status in ('submitting', 'submitted', 'confirmed', 'failed', 'needs_attention');
-- Different arms must not concurrently allocate a nonce from the same wallet.
create unique index news_agent_actions_active_wallet_idx
  on from_fed_to_chain.news_agent_actions (lower(wallet_address))
  where status in ('submitting', 'submitted', 'needs_attention');
create index news_agent_actions_due_idx
  on from_fed_to_chain.news_agent_actions (status, next_attempt_at);

alter table from_fed_to_chain.news_agent_actions enable row level security;
revoke all on from_fed_to_chain.news_agent_actions from public, anon, authenticated;
grant all on from_fed_to_chain.news_agent_actions to service_role;
create policy "Service role can manage news agent actions"
  on from_fed_to_chain.news_agent_actions for all to service_role
  using (true) with check (true);
notify pgrst, 'reload schema';
commit;
