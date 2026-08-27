begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Close the `anon` / `authenticated` path into schema `public`.
--
-- A production anon key sits in this repository's public git history. Through
-- PostgREST it held full CRUD on eight RLS-less tables (users,
-- user_crypto_wallets, user_subscriptions, strategy_trade_history,
-- strategy_saved_configs, notification_settings,
-- telegram_verification_tokens, plans), full CRUD on jobs / job_logs via a
-- policy literally named "Allow anon to manage jobs" (`for all to public using
-- (true)`), read access through a view that runs as its BYPASSRLS owner, and
-- EXECUTE on seven `security definer` functions owned by postgres — including
-- get_users_wallets_by_ids (every user + wallet in one call) and
-- update_user_email_and_upgrade_plan.
--
-- The fix is to delete the role rather than write policies for it. Nothing in
-- this system authenticates as anon or `authenticated`: there is no Supabase
-- Auth (identity is Privy) and no Realtime client, and every server-side
-- Supabase client now uses the service-role key. An `auth.uid()` policy would
-- never match, so it would be machinery that only looks like a control.
--
-- Four locks, in order of what actually stops the leaked key:
--   1. revoke the grants          — after this the key has nothing to reach
--   2. fix the default privileges — the reason every new table reopened the hole
--   3. RLS                        — defence in depth if a grant ever comes back
--   4. lock the functions         — EXECUTE was inherited from PUBLIC
--
-- Roles that connect directly to Postgres (alpha_etl_user for apps/alpha-etl,
-- readonly_user for apps/analytics-engine) do NOT have rolbypassrls, so every
-- table that gains RLS also gains a policy mirroring their existing grants.
-- Without it, alpha-etl's `UPDATE user_crypto_wallets SET
-- last_portfolio_update_at` would match zero rows and raise nothing — its
-- caller treats the failure as non-fatal and only logs `rowsUpdated: 0`.
-- service_role and postgres are unaffected throughout: both are BYPASSRLS.

-- ---------------------------------------------------------------------------
-- 1. Revoke every grant anon / authenticated hold in `public`
-- ---------------------------------------------------------------------------
-- Covers all 15 tables and the 3 views; there are no materialized views in
-- this schema (`portfolio_category_trend_mv` is a plain view despite the name),
-- which `on all tables` would not reach.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Root cause: stop granting `public` objects to anon on creation
-- ---------------------------------------------------------------------------
-- `pg_default_acl` currently reads `anon=arwdDxt/postgres` for tables in this
-- schema, which is why every table added since the project was created handed
-- anon full CRUD without anyone writing a GRANT. Only postgres's own default
-- ACL is addressed here: migrations create objects as postgres, so that is the
-- one that applies. supabase_admin keeps a similar default ACL that postgres
-- cannot alter (it is not a superuser), but nothing in this repository creates
-- `public` objects as supabase_admin.
--
-- This closes tables and sequences for good. It does NOT close functions, and
-- the asymmetry is worth stating because it is not obvious: EXECUTE on a new
-- function comes from PostgreSQL's built-in PUBLIC default, which is merged in
-- at creation time on top of pg_default_acl. `alter default privileges ...
-- revoke execute on functions from public` is normalised away and a function
-- created afterwards still carries `=X`. Revoking anon's schema USAGE would not
-- help either: USAGE on `public` comes from the `=U/pg_database_owner` entry
-- (PUBLIC), and revoking that would also strip Supabase-internal roles such as
-- `authenticator`, which is why it is deliberately left alone.
--
-- What closes functions instead: after the key rotation no valid anon JWT
-- exists, so the role is unreachable through PostgREST; and every migration
-- that adds a function to `public` must revoke PUBLIC EXECUTE itself, the way
-- section 4 does for the current set. That requirement is recorded in
-- CONTRIBUTING.md alongside the other migration rules.

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS as the second lock
-- ---------------------------------------------------------------------------
-- On jobs / job_logs, RLS was already enabled but provided no protection: the
-- "Allow anon to manage ..." policies are `for all to public using (true)`,
-- which matches every role. Their "Service role can manage ..." siblings are
-- also `to public` and call `auth.role()`, which is always NULL on a direct
-- Postgres connection — dead weight now that service_role is BYPASSRLS, and a
-- latent error source for the two direct-connection roles. All four are
-- replaced by the same role-scoped policy the other tables get.

drop policy if exists "Allow anon to manage jobs" on public.jobs;
drop policy if exists "Service role can manage jobs" on public.jobs;
drop policy if exists "Allow anon to manage job logs" on public.job_logs;
drop policy if exists "Service role can manage job logs" on public.job_logs;

do $$
declare
  target text;
begin
  foreach target in array array[
    'users',
    'user_crypto_wallets',
    'user_subscriptions',
    'strategy_trade_history',
    'strategy_saved_configs',
    'notification_settings',
    'telegram_verification_tokens',
    'plans',
    'jobs',
    'job_logs'
  ]
  loop
    execute format(
      'alter table public.%I enable row level security', target
    );
    execute format(
      'drop policy if exists direct_service_roles_full_access on public.%I',
      target
    );
    -- One policy, deliberately uniform: anon and authenticated get none, so
    -- RLS denies them outright. Grants remain the ceiling, so `for all` does
    -- not widen readonly_user beyond the SELECT it already holds.
    execute format(
      'create policy direct_service_roles_full_access on public.%I '
      'for all to alpha_etl_user, readonly_user '
      'using (true) with check (true)',
      target
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Lock the functions
-- ---------------------------------------------------------------------------
-- Every postgres-owned function in `public` carried `=X/postgres` — EXECUTE to
-- PUBLIC — so revoking anon and authenticated alone would leave the door open
-- through PUBLIC. alpha_etl_user reached get_users_wallets_by_ids and
-- get_users_wallets_by_plan_with_activity only through that PUBLIC entry and
-- has no explicit grant, so it must be granted here or apps/alpha-etl loses
-- its VIP-user fetch.
--
-- Pinning search_path closes the escalation this combination invites: seven of
-- these are `security definer` owned by postgres, which is BYPASSRLS, and none
-- had a search_path of its own. `pg_temp` goes last so a temporary object
-- cannot shadow a real one. Extension functions in this schema (pg_trgm) are
-- owned by supabase_admin, are pure text helpers, and are left alone.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure::text as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proowner = 'postgres'::regrole
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated',
      fn.signature
    );
    execute format(
      'grant execute on function %s to postgres, service_role, '
      'readonly_user, alpha_etl_user',
      fn.signature
    );
    execute format(
      'alter function %s set search_path = public, pg_temp',
      fn.signature
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Stop the view from running as its BYPASSRLS owner
-- ---------------------------------------------------------------------------
-- regime_transitions_view is the only view in `public` without
-- security_invoker, so it read alpha_raw.sentiment_snapshots with postgres's
-- privileges on behalf of whoever queried it. Its one real consumer is
-- apps/analytics-engine as readonly_user, which holds USAGE on alpha_raw and
-- SELECT on that table directly, so invoker rights change nothing for it.

alter view public.regime_transitions_view set (security_invoker = true);

commit;
