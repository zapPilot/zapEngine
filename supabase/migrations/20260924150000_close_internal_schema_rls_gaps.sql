begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Make the access model of the internal schemas explicit, and close the last
-- anon write path into retired podcast tables.
--
-- alpha_raw and ops are not in pgrst.db_schemas and anon / authenticated hold
-- no USAGE on either, so nothing here is reachable through the Data API today.
-- RLS is added as the second lock, the way the public lockdown did it: if a
-- grant or an exposed schema ever comes back, the table still denies by
-- default.
--
-- RLS has one failure mode that raises nothing. A role without BYPASSRLS that
-- no policy names reads zero rows, and its UPDATE / DELETE match zero rows.
-- Every role that touches these tables was taken from pg_stat_statements:
-- alpha_etl_user (apps/alpha-etl) and readonly_user (apps/analytics-engine)
-- are the only NOBYPASSRLS ones, so each gets a policy. postgres,
-- service_role and supabase_read_only_user are BYPASSRLS and are unaffected.

-- ---------------------------------------------------------------------------
-- 1. alpha_raw: RLS with one policy per direct-connect role
-- ---------------------------------------------------------------------------
-- The policies mirror the grants instead of widening them. readonly_user only
-- holds SELECT and connects with default_transaction_read_only, so it gets a
-- SELECT policy: a write grant added by mistake later still writes nothing.
-- alpha-etl inserts, upserts, updates and deletes, so its policy is FOR ALL.

do $$
declare
  target text;
begin
  foreach target in array array[
    'etl_job_queue',
    'hyperliquid_vault_apr_snapshots',
    'macro_fear_greed_snapshots',
    'sentiment_snapshots',
    'stock_price_dma_snapshots',
    'stock_price_snapshots',
    'token_pair_ratio_dma_snapshots',
    'token_price_dma_snapshots',
    'token_price_snapshots'
  ]
  loop
    execute format(
      'alter table alpha_raw.%I enable row level security', target
    );
    execute format(
      'drop policy if exists direct_etl_full_access on alpha_raw.%I', target
    );
    execute format(
      'create policy direct_etl_full_access on alpha_raw.%I '
      'for all to alpha_etl_user using (true) with check (true)',
      target
    );
    execute format(
      'drop policy if exists direct_readonly_select on alpha_raw.%I', target
    );
    execute format(
      'create policy direct_readonly_select on alpha_raw.%I '
      'for select to readonly_user using (true)',
      target
    );
  end loop;
end
$$;

-- Only the missing schema USAGE keeps the Data API roles out of this view:
-- the table underneath grants them SELECT too. Dropping the view grants means
-- exposing the schema later cannot open it. alpha_etl_user and readonly_user,
-- the only roles besides its owner that have read it, keep their grants.
revoke all on table alpha_raw.daily_wallet_token_snapshots
  from anon, authenticated, service_role;

-- Both functions carried PostgreSQL's built-in EXECUTE to PUBLIC, and
-- create_etl_job_for_wallet is SECURITY DEFINER as a BYPASSRLS owner with no
-- search_path of its own. Nothing calls either: unqualified calls resolve to
-- the public copies, apps/alpha-etl now inserts into etl_job_queue directly,
-- and every create_etl_job_for_wallet call that passes its rate-limit check
-- fails, because its `status` column reference is ambiguous with its own OUT
-- parameter.
-- Both bodies already schema-qualify every relation, so an empty search_path
-- only removes the chance of an object shadowing a built-in.
revoke execute on function alpha_raw.create_etl_job_for_wallet(
  uuid, character varying, character varying, character varying, text
) from public, anon, authenticated;
revoke execute on function alpha_raw.get_next_etl_job()
  from public, anon, authenticated;

alter function alpha_raw.create_etl_job_for_wallet(
  uuid, character varying, character varying, character varying, text
) set search_path = '';
alter function alpha_raw.get_next_etl_job() set search_path = '';

-- ---------------------------------------------------------------------------
-- 2. ops: the two podcast control tables become deny-all
-- ---------------------------------------------------------------------------
-- Only postgres holds table privileges. Every reader and writer is either a
-- SECURITY DEFINER function owned by postgres (the deployment gate RPCs, the
-- release marker, the lineage trigger) or an invoker helper that only those
-- functions call, and postgres is BYPASSRLS, so enabling RLS with no policy
-- changes no query. No policy is added for service_role: it has no grant to
-- pair one with, and the rls_enabled_no_policy advisor notice is the intended
-- state.

alter table ops.podcast_pipeline_release_state enable row level security;
alter table ops.podcast_deployment_control enable row level security;

-- ---------------------------------------------------------------------------
-- 3. from_fed_to_chain: retire the anon write path of the old mobile app
-- ---------------------------------------------------------------------------
-- likes, user_episode_state and users belonged to the retired mobile client;
-- listening progress now lives on the device. Their policies still let anon
-- insert, update and delete every row with `using (true)`, so any key that
-- maps to anon could rewrite them. The tables and their rows are kept; only
-- the Data API roles lose them.
--
-- episodes_with_stats is security_invoker and joins likes, which makes it the
-- one anon-granted object that depends on these grants. An anon read of it
-- already fails before this migration, because anon holds no SELECT on
-- episode_localizations.language_classrooms_jsonb, and podcast-pipeline
-- serves the feed with the service-role key, which keeps its grants.
--
-- sign_in_podcast_user writes users as its SECURITY DEFINER owner, so the
-- table revokes alone would leave anon a way in; its EXECUTE goes too. No
-- current client calls it, and none of the three tables has been written
-- since 2026-07-30.

drop policy if exists "anon delete likes" on from_fed_to_chain.likes;
drop policy if exists "anon insert likes" on from_fed_to_chain.likes;
drop policy if exists "anon read likes" on from_fed_to_chain.likes;
drop policy if exists "anon update likes" on from_fed_to_chain.likes;
drop policy if exists "anon read state" on from_fed_to_chain.user_episode_state;
drop policy if exists "anon write state" on from_fed_to_chain.user_episode_state;
drop policy if exists "anon insert podcast users" on from_fed_to_chain.users;
drop policy if exists "anon read podcast users" on from_fed_to_chain.users;
drop policy if exists "anon update podcast users" on from_fed_to_chain.users;

-- Revoking the table privilege also revokes the per-column grants.
revoke all on table
  from_fed_to_chain.likes,
  from_fed_to_chain.user_episode_state,
  from_fed_to_chain.users
  from anon, authenticated;

revoke execute on function from_fed_to_chain.sign_in_podcast_user(text, text)
  from public, anon, authenticated;

-- `drop policy if exists` would pass over a misspelt or unexpected policy, so
-- fail the migration instead of leaving an anon policy behind.
do $$
declare
  leftover text;
begin
  select string_agg(format('%I on %I', policyname, tablename), ', ')
    into leftover
    from pg_policies
   where schemaname = 'from_fed_to_chain'
     and tablename in ('likes', 'user_episode_state', 'users')
     and roles && array['anon', 'authenticated', 'public']::name[];

  if leftover is not null then
    raise exception 'Data API policies remain on retired podcast tables: %',
      leftover;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Record the contract where the next migration author will see it
-- ---------------------------------------------------------------------------

comment on schema alpha_raw is
  'Raw market data and the ETL job queue. Not in pgrst.db_schemas; anon and '
  'authenticated have no USAGE. Only direct Postgres connections reach it: '
  'alpha_etl_user writes and readonly_user reads, and neither bypasses RLS. '
  'Every table enables RLS with the direct_etl_full_access and '
  'direct_readonly_select policies; a direct role missing from a policy '
  'reads zero rows without an error.';

comment on schema ops is
  'Internal operations state. Not in pgrst.db_schemas; anon and '
  'authenticated have no USAGE. service_role reaches it only through '
  'service-role-only views and SECURITY DEFINER RPCs in from_fed_to_chain. '
  'Every table enables RLS; tables without a service_role grant are '
  'deny-all and have no policy.';

do $$
declare
  target text;
begin
  foreach target in array array[
    'operator_actions',
    'operator_cycles',
    'operator_incidents',
    'operator_verifications',
    'podcast_deployment_control',
    'podcast_pipeline_release_state',
    'runtime_records'
  ]
  loop
    execute format(
      'comment on table ops.%I is %L',
      target,
      'Deny-all RLS by design: no anon, authenticated or service_role table '
      'grants. Only SECURITY DEFINER functions owned by the BYPASSRLS '
      'postgres role read or write it, called as service_role-only RPCs in '
      'from_fed_to_chain or fired as triggers.'
    );
  end loop;
end
$$;

comment on table public.strategy_change_notification_state is
  'Last equity-curve trade-event date already announced on Telegram, per '
  'strategy. Service-role only: RLS is on with no policy, so the SELECT that '
  'readonly_user and alpha_etl_user inherit from the public default '
  'privileges returns no rows.';

commit;
