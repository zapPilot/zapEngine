begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Per-source portfolio freshness.
--
-- `user_crypto_wallets.last_portfolio_update_at` is one timestamp per wallet,
-- and `get_user_service_states()` gated every provider on it. DeBank was the
-- only writer, so once DeBank succeeded the same daily run declared the wallet
-- fresh for Hyperliquid too and the Hyperliquid slice was skipped -- every day,
-- silently, since the wallet-level fence shipped. One timestamp cannot answer
-- "is this wallet due" for two independent providers; this migration gives each
-- provider its own answer.

-- ---------------------------------------------------------------------------
-- 1. Per (wallet, source) refresh state
-- ---------------------------------------------------------------------------
-- Keyed on the wallet address rather than the user: the address is what a
-- provider is called for, and this state has to survive a user deleting and
-- re-adding the same wallet -- re-verification does not make yesterday's DeBank
-- call un-happen. `user_id` rides along for attribution only, which is why it
-- carries no foreign key: the same address can belong to a different account
-- tomorrow without invalidating the refresh history.
create table if not exists ops.wallet_source_refresh_state (
  -- Stored lowercase because that is how alpha-etl normalizes an address
  -- before calling a provider; the constraint stops a checksum-cased row from
  -- becoming a second, permanently-due copy of the same wallet.
  wallet text not null check (wallet = lower(wallet)),
  source text not null check (source in ('debank', 'hyperliquid')),
  user_id uuid,
  -- An attempt that failed still moved: `last_attempt_at` shows the job tried,
  -- while `last_success_at` -- the only field scheduling reads -- stays where
  -- it was, so a failing provider keeps its wallets due instead of aging into
  -- an unexplained gap.
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  constraint wallet_source_refresh_state_pkey primary key (wallet, source)
);

alter table ops.wallet_source_refresh_state enable row level security;

drop policy if exists "Service role can manage wallet source refresh state" on ops.wallet_source_refresh_state;
create policy "Service role can manage wallet source refresh state"
  on ops.wallet_source_refresh_state for all to service_role using (true) with check (true);

grant all on ops.wallet_source_refresh_state to service_role;
revoke all on ops.wallet_source_refresh_state from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Seed -- DeBank only, deliberately
-- ---------------------------------------------------------------------------
-- The legacy column records DeBank refreshes and nothing else, so seeding
-- DeBank from it is a restatement of a fact the database already held.
--
-- Hyperliquid is left unseeded on purpose. Seeding it would declare a freshness
-- nobody ever observed -- those refreshes were being skipped, which is the bug
-- this migration exists to fix -- and would postpone the first repair by up to
-- twenty hours. Unseeded, every priority wallet is due for Hyperliquid the next
-- time the daily job runs, and the gap closes immediately. DeBank keeps its
-- fence, so a manual re-dispatch after this lands does not re-bill the
-- expensive provider.
insert into ops.wallet_source_refresh_state (wallet, source, user_id, last_attempt_at, last_success_at)
select distinct on (lower(w.wallet))
  lower(w.wallet),
  'debank',
  w.user_id,
  w.last_portfolio_update_at,
  w.last_portfolio_update_at
from public.user_crypto_wallets w
where w.wallet is not null
  and w.wallet <> ''
  and w.last_portfolio_update_at is not null
order by lower(w.wallet), w.last_portfolio_update_at desc
on conflict (wallet, source) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Read path for the Control Center
-- ---------------------------------------------------------------------------
-- Same narrow security_invoker bridge the cost, pipeline and usage ledgers
-- use: `ops` stays invisible to PostgREST, service_role reaches the raw rows.
create or replace view from_fed_to_chain.ops_wallet_source_refresh_state
with (security_invoker = true) as
select
  wallet,
  source,
  user_id,
  last_attempt_at,
  last_success_at,
  last_error,
  updated_at
from ops.wallet_source_refresh_state;

grant select on from_fed_to_chain.ops_wallet_source_refresh_state to service_role;
revoke all on from_fed_to_chain.ops_wallet_source_refresh_state from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Write path for alpha-etl
-- ---------------------------------------------------------------------------
-- alpha_etl_user connects as itself over raw pg and holds no privilege on the
-- ops schema, so the write goes through a definer function in public, exactly
-- as ops_record_user_resource_usage does.
--
-- Unlike the usage ledger this is not additive: it is the current answer to
-- "when did this source last land data for this wallet", so each call replaces
-- the state rather than accumulating onto it.
create or replace function public.ops_record_wallet_source_refresh(p_rows jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into ops.wallet_source_refresh_state as existing (
    wallet,
    source,
    user_id,
    last_attempt_at,
    last_success_at,
    last_error
  )
  -- One payload can name the same (wallet, source) twice -- two accounts
  -- registered the same address -- and `on conflict` cannot resolve a pair
  -- that appears twice in the same statement. The failure wins the tie: a
  -- wallet left due costs one extra provider call, a wallet wrongly marked
  -- fresh costs a missing day of data.
  select distinct on (lower(line.wallet), line.source)
    lower(line.wallet),
    line.source,
    line.user_id,
    now(),
    case when line.succeeded then now() end,
    case when line.succeeded then null else left(line.error, 500) end
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as line(
    wallet text,
    source text,
    user_id uuid,
    succeeded boolean,
    error text
  )
  where line.wallet is not null
    and line.wallet <> ''
    and line.source is not null
    and line.succeeded is not null
  order by lower(line.wallet), line.source, line.succeeded
  on conflict (wallet, source) do update
  set
    -- An address that changed hands keeps its history and gains the new
    -- attribution; a payload that omitted the user does not erase it.
    user_id = coalesce(excluded.user_id, existing.user_id),
    last_attempt_at = excluded.last_attempt_at,
    -- Never reset by a failure: scheduling reads this field, and clearing it
    -- would turn one bad afternoon into a wallet that looks like it has never
    -- been refreshed.
    last_success_at = coalesce(excluded.last_success_at, existing.last_success_at),
    last_error = excluded.last_error,
    updated_at = now();
$$;

revoke all on function public.ops_record_wallet_source_refresh(jsonb) from public, anon, authenticated;
grant execute on function public.ops_record_wallet_source_refresh(jsonb)
  to postgres, service_role, alpha_etl_user;

comment on function public.ops_record_wallet_source_refresh(jsonb) is
  'Record the outcome of one provider refresh per (wallet, source). Rows: {wallet, source, user_id, succeeded, error}. Only a successful attempt advances last_success_at, which is what get_user_service_states() gates scheduling on.';

-- ---------------------------------------------------------------------------
-- 5. Scheduling policy, now per source
-- ---------------------------------------------------------------------------
-- Dropped and recreated rather than replaced: the return type gains columns,
-- which `create or replace function` cannot do. Every pre-existing column keeps
-- its name, position and meaning -- alpha-etl and the Control Center both
-- select them explicitly -- so the only behavioural change for an existing
-- reader is that `due_for_refresh` now means "some portfolio source is due"
-- rather than "the wallet timestamp is old". During a deploy window that
-- direction is the safe one: old code reading the new function can only
-- over-refresh, never skip.
drop function if exists public.get_user_service_states();

create function public.get_user_service_states()
returns table (
  user_id uuid,
  email text,
  wallet text,
  plan_code text,
  last_activity_at timestamptz,
  last_portfolio_update_at timestamptz,
  default_tier text,
  override_tier text,
  override_reason text,
  override_expires_at timestamptz,
  effective_tier text,
  refresh_interval_hours integer,
  due_for_refresh boolean,
  aum_usd numeric,
  wallet_created_at timestamptz,
  due_sources text[],
  source_states jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with entitlement as (
    -- Highest entitlement wins. A VIP also holds the 'free' subscription that
    -- wallet connect creates, and picking the newest row instead would demote
    -- them the moment a later free row appeared.
    select
      s.user_id,
      case when bool_or(lower(p.code) = 'vip') then 'vip' else min(lower(p.code)) end as plan_code
    from public.user_subscriptions s
    join public.plans p on p.code = s.plan_code
    where (s.is_canceled = false or s.is_canceled is null)
      and now() >= s.starts_at
      and (s.ends_at is null or now() <= s.ends_at)
    group by s.user_id
  )
  select distinct on (w.wallet)
    u.id as user_id,
    u.email,
    w.wallet::text as wallet,
    e.plan_code,
    u.last_activity_at,
    w.last_portfolio_update_at,
    tier.default_tier,
    o.service_tier as override_tier,
    o.reason as override_reason,
    o.expires_at as override_expires_at,
    coalesce(o.service_tier, tier.default_tier) as effective_tier,
    case
      when coalesce(o.service_tier, tier.default_tier) = 'priority' then 24
      else null
    end::integer as refresh_interval_hours,
    -- Kept as the coarse answer the pipeline factory and the dashboard already
    -- read: true when at least one source below is due.
    (
      coalesce(o.service_tier, tier.default_tier) = 'priority'
      and cardinality(source_refresh.stale_sources) > 0
    ) as due_for_refresh,
    aum.total_value_usd as aum_usd,
    w.created_at as wallet_created_at,
    -- The scheduling answer a per-source processor asks for. Empty for a
    -- wallet that is not on the priority cadence, so a caller that filters on
    -- membership needs no second tier check.
    case
      when coalesce(o.service_tier, tier.default_tier) = 'priority'
        then source_refresh.stale_sources
      else '{}'::text[]
    end as due_sources,
    -- Every source, due or not, with the evidence behind the decision. The
    -- Control Center reports freshness from this rather than from the legacy
    -- column, which only ever described DeBank.
    source_refresh.source_states
  from public.users u
  join entitlement e on e.user_id = u.id
  join public.user_crypto_wallets w on w.user_id = u.id
  cross join lateral (
    select case when e.plan_code = 'vip' then 'priority' else 'standard' end as default_tier
  ) tier
  left join ops.user_service_overrides o
    on o.user_id = u.id
    and (o.expires_at is null or now() < o.expires_at)
  -- One row per portfolio provider per wallet, joined to whatever state that
  -- provider has recorded. A source with no row has never landed data for this
  -- wallet and is therefore due -- the same reading the legacy null timestamp
  -- carried, now answered once per provider.
  cross join lateral (
    select
      coalesce(
        array_agg(s.source order by s.source) filter (
          where r.last_success_at is null
            -- 20 hours, not 24: the daily job's own start time drifts, and a
            -- 24 hour fence would skip a wallet whenever today's run began a
            -- few minutes earlier than yesterday's.
            or r.last_success_at < now() - interval '20 hours'
        ),
        '{}'::text[]
      ) as stale_sources,
      jsonb_object_agg(
        s.source,
        jsonb_build_object(
          'last_success_at', r.last_success_at,
          'last_attempt_at', r.last_attempt_at,
          'last_error', r.last_error
        )
      ) as source_states
    from (values ('debank'::text), ('hyperliquid'::text)) as s(source)
    left join ops.wallet_source_refresh_state r
      on r.wallet = lower(w.wallet::text)
      and r.source = s.source
  ) source_refresh
  -- analytics.daily_category_trends stores one row per category per day, all
  -- carrying the same user total, so the newest single row is the AUM.
  left join lateral (
    select t.total_value_usd
    from analytics.daily_category_trends t
    where t.user_id = u.id
      and t.total_value_usd is not null
    order by t.date desc
    limit 1
  ) aum on true
  where w.wallet is not null
    and w.wallet <> ''
    and w.ownership_verified_at is not null
  -- One row per wallet even when two accounts registered the same address:
  -- the priority holder wins, then the more recently active user.
  order by w.wallet, (e.plan_code = 'vip') desc, u.last_activity_at desc nulls last;
$$;

revoke all on function public.get_user_service_states() from public, anon, authenticated;
grant execute on function public.get_user_service_states()
  to postgres, service_role, alpha_etl_user;

comment on function public.get_user_service_states() is
  'Effective service policy per verified wallet. due_sources lists the portfolio providers that have not landed data in the last 20 hours; due_for_refresh is true when that list is non-empty. Single source of truth for both alpha-etl scheduling and Control Center reporting.';

-- ---------------------------------------------------------------------------
-- 6. Retire the legacy column's scheduling role
-- ---------------------------------------------------------------------------
-- The column stays: it is what seeded DeBank above, and dropping a column that
-- generated database types still reference buys nothing. What changes is that
-- nothing schedules from it any more, and alpha-etl now stamps it after the
-- load commits rather than after the fetch returns -- a DeBank batch that
-- fetched cleanly and then failed to write used to look refreshed.
comment on column public.user_crypto_wallets.last_portfolio_update_at is
  'DeBank-only display aggregate, stamped by alpha-etl after a successful load (not after the fetch). Not a scheduling gate: scheduling reads ops.wallet_source_refresh_state through get_user_service_states().';

commit;
