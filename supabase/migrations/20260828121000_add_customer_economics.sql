begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Customer economics: who is being served, at what service level, and what
-- serving them costs. The pieces already existed as scattered implications --
-- a plan code, a wallet timestamp, an account-level DeBank invoice -- but
-- nothing joined them, so "this wallet has not opened the app in three months
-- and still costs two DeBank calls a day" was not a question anything could
-- answer.
--
-- Two tables and two functions, in the private ops schema plus the two public
-- entry points that alpha-etl (raw pg, alpha_etl_user, NOBYPASSRLS) can reach.

-- ---------------------------------------------------------------------------
-- 1. Commercial entitlement vs. scheduling policy
-- ---------------------------------------------------------------------------
-- `plans.code` answers "what did this user buy". It cannot answer "how often
-- should we refresh them", which is an operational decision that has to move
-- without touching billing -- pausing a dormant VIP, promoting a large
-- standard account for a week. That decision lives here.
create table if not exists ops.user_service_overrides (
  user_id uuid primary key references public.users(id) on delete cascade,
  service_tier text not null check (service_tier in ('priority', 'standard', 'paused')),
  -- Free text and required: an override with no recorded reason is an override
  -- nobody can safely revoke six months later.
  reason text not null,
  -- Null means open-ended. A dated override expires on its own rather than
  -- outliving the situation that justified it.
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Per-user provider usage
-- ---------------------------------------------------------------------------
-- DeBank bills one account-level monthly figure in API units and publishes no
-- per-endpoint price, so per-user *cost* cannot be measured -- only allocated.
-- What can be measured is request volume, which is what this table stores.
-- `cost_basis` keeps the difference visible instead of letting an allocation
-- read as an invoice.
--
-- Deliberately no foreign key: the usage ledger has to outlive the user it
-- describes, the same way ops.pipeline_runs outlives its episode.
create table if not exists ops.user_resource_usage_daily (
  usage_date date not null,
  user_id uuid not null,
  wallet text not null,
  provider text not null check (provider in ('debank', 'hyperliquid')),
  resource text not null,
  request_count integer not null default 0 check (request_count >= 0),
  -- Provider-native units where a provider reports them (DeBank api_units).
  usage_units numeric(18, 6),
  estimated_cost_usd numeric(18, 8) check (estimated_cost_usd >= 0),
  cost_basis text not null default 'allocated_estimate'
    check (cost_basis in ('measured', 'allocated_estimate')),
  updated_at timestamptz not null default now(),
  constraint user_resource_usage_daily_pkey
    primary key (usage_date, user_id, wallet, provider, resource)
);

create index if not exists idx_user_resource_usage_daily_user
  on ops.user_resource_usage_daily (user_id, usage_date desc);

alter table ops.user_service_overrides enable row level security;
alter table ops.user_resource_usage_daily enable row level security;

drop policy if exists "Service role can manage user service overrides" on ops.user_service_overrides;
create policy "Service role can manage user service overrides"
  on ops.user_service_overrides for all to service_role using (true) with check (true);

drop policy if exists "Service role can manage user resource usage" on ops.user_resource_usage_daily;
create policy "Service role can manage user resource usage"
  on ops.user_resource_usage_daily for all to service_role using (true) with check (true);

grant all on ops.user_service_overrides to service_role;
grant all on ops.user_resource_usage_daily to service_role;

revoke all on ops.user_service_overrides from public, anon, authenticated;
revoke all on ops.user_resource_usage_daily from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Read path for the Control Center
-- ---------------------------------------------------------------------------
-- ops stays invisible to PostgREST; service_role reaches it through the same
-- narrow security_invoker bridge the cost and pipeline ledgers use.
create or replace view from_fed_to_chain.ops_user_resource_usage_daily
with (security_invoker = true) as
select
  usage_date,
  user_id,
  wallet,
  provider,
  resource,
  request_count,
  usage_units,
  estimated_cost_usd,
  cost_basis,
  updated_at
from ops.user_resource_usage_daily;

grant select on from_fed_to_chain.ops_user_resource_usage_daily to service_role;
revoke all on from_fed_to_chain.ops_user_resource_usage_daily from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Write path for alpha-etl
-- ---------------------------------------------------------------------------
-- alpha_etl_user connects as itself over raw pg and holds no privilege on the
-- ops schema. Rather than widening that role, the write goes through a
-- definer function in public -- the schema it already reaches -- exactly as
-- the existing get_users_wallets_by_* functions do.
--
-- Counts accumulate rather than replace: a source is processed once per day,
-- but a re-run after a partial failure did make those extra calls, and the
-- ledger's job is to record calls that happened.
create or replace function public.ops_record_user_resource_usage(p_rows jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into ops.user_resource_usage_daily as existing (
    usage_date,
    user_id,
    wallet,
    provider,
    resource,
    request_count,
    usage_units,
    estimated_cost_usd,
    cost_basis
  )
  select
    line.usage_date,
    line.user_id,
    line.wallet,
    line.provider,
    line.resource,
    coalesce(line.request_count, 0),
    line.usage_units,
    line.estimated_cost_usd,
    coalesce(line.cost_basis, 'allocated_estimate')
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as line(
    usage_date date,
    user_id uuid,
    wallet text,
    provider text,
    resource text,
    request_count integer,
    usage_units numeric,
    estimated_cost_usd numeric,
    cost_basis text
  )
  where line.usage_date is not null
    and line.user_id is not null
    and line.wallet is not null
    and line.provider is not null
    and line.resource is not null
  on conflict (usage_date, user_id, wallet, provider, resource) do update
  set
    request_count = existing.request_count + excluded.request_count,
    usage_units = coalesce(excluded.usage_units, existing.usage_units),
    estimated_cost_usd = coalesce(excluded.estimated_cost_usd, existing.estimated_cost_usd),
    cost_basis = excluded.cost_basis,
    updated_at = now();
$$;

revoke all on function public.ops_record_user_resource_usage(jsonb) from public, anon, authenticated;
grant execute on function public.ops_record_user_resource_usage(jsonb)
  to postgres, service_role, alpha_etl_user;

-- ---------------------------------------------------------------------------
-- 5. Effective service policy -- the single source of truth
-- ---------------------------------------------------------------------------
-- alpha-etl decides what to refresh, the Control Center reports what is being
-- served, and an operator asks which accounts cost more than they return.
-- Three readers, one answer: putting the rule anywhere but here guarantees the
-- day when the dashboard says Standard and the ETL still bills for Priority.
--
-- Unlike get_users_wallets_by_plan_with_activity this is not filtered by plan.
-- Standard (free) users are returned with refresh_interval_hours null and
-- due_for_refresh false: they are visible to operations but not scheduled.
-- Turning weekly refresh on for them is a one-line change to the cadence
-- expression below, not a new code path.
create or replace function public.get_user_service_states()
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
  aum_usd numeric
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
    (
      coalesce(o.service_tier, tier.default_tier) = 'priority'
      and (
        w.last_portfolio_update_at is null
        -- 20 hours, not 24: the daily job's own start time drifts, and a 24
        -- hour fence would skip a wallet whenever today's run began a few
        -- minutes earlier than yesterday's.
        or w.last_portfolio_update_at < now() - interval '20 hours'
      )
    ) as due_for_refresh,
    aum.total_value_usd as aum_usd
  from public.users u
  join entitlement e on e.user_id = u.id
  join public.user_crypto_wallets w on w.user_id = u.id
  cross join lateral (
    select case when e.plan_code = 'vip' then 'priority' else 'standard' end as default_tier
  ) tier
  left join ops.user_service_overrides o
    on o.user_id = u.id
    and (o.expires_at is null or now() < o.expires_at)
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
  'Single source of truth for effective per-wallet service policy: default tier from plan, operator override from ops.user_service_overrides, refresh cadence, and due-for-refresh gating. Read by apps/alpha-etl and apps/control-center.';

notify pgrst, 'reload schema';

commit;
